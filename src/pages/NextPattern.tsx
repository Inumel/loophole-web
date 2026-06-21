import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type StashEntry = {
  yarn_catalog_id: string;
  name: string;
  brand: string | null;
  weight: string | null;
  color_hex: string | null;
  colorway: string | null;
  total_yards: number; // converted, best-effort
  has_gram_only: boolean; // true if some batches only have gram quantities
};

type YarnQty = {
  amount: number;
  unit: string;
  size?: string;
  color?: string;
  note?: string;
};

type Pattern = {
  id: string;
  name: string;
  yarn_weight: string | null;
  difficulty: string | null;
  category: string | null;
  notes: string | null;
  yarn_quantity: YarnQty[] | null;
};

type Match = {
  pattern: Pattern;
  rating: 'great' | 'possible' | 'partial';
  matchedYarn: StashEntry | null;
  requiredYards: number | null;
  availableYards: number | null;
  reasons: string[];
  concerns: string[];
};

// ── Unit conversion ────────────────────────────────────────────────────────────
// Grams-to-yards is approximate; we flag these rather than silently converting.
function toYards(amount: number, unit: string): number | null {
  const u = unit.toLowerCase();
  if (u === 'yards' || u === 'yard' || u === 'yds') return amount;
  if (u === 'meters' || u === 'meter' || u === 'm') return Math.round(amount * 1.094);
  return null; // grams — can't convert without WPI
}

// Approximate yardage per gram by weight category (midpoint estimates).
// Used only when we have no yardage data at all.
const APPROX_YARDS_PER_GRAM: Record<string, number> = {
  'Lace': 50, 'Fingering': 28, 'Sport': 20, 'DK': 14,
  'Worsted': 10, 'Aran': 8, 'Bulky': 5, 'Super Bulky': 3,
};

// ── Weight normalisation ───────────────────────────────────────────────────────
// Patterns and stash may use slightly different labels.
const WEIGHT_ALIASES: Record<string, string[]> = {
  'Lace':        ['lace', 'lace weight'],
  'Fingering':   ['fingering', 'fingering weight', 'sock', 'light fingering'],
  'Sport':       ['sport', 'sport weight'],
  'DK':          ['dk', 'dk weight', 'light worsted', 'light (3)'],
  'Worsted':     ['worsted', 'worsted weight', 'medium', 'medium (4)', 'aran/worsted'],
  'Aran':        ['aran', 'aran weight'],
  'Bulky':       ['bulky', 'bulky weight', 'chunky', 'bulky (5)'],
  'Super Bulky': ['super bulky', 'super bulky weight', 'super chunky', 'jumbo'],
};

function normaliseWeight(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(WEIGHT_ALIASES)) {
    if (aliases.some(a => lower.includes(a))) return canonical;
  }
  return raw; // passthrough if unrecognised
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NextPatternPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stash, setStash] = useState<StashEntry[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<'all' | 'great' | 'possible' | 'partial'>('all');
  const [weightFilter, setWeightFilter] = useState<string>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    // Fetch all in-stock stash grouped by catalog entry
    const { data: stashData } = await supabase
      .from('yarn_stash')
      .select('quantity, unit, yarn_catalog:yarn_catalog_id(id, name, brand, weight, color_hex, colorway)')
      .eq('status', 'in_stock');

    // Aggregate stash by yarn_catalog_id
    const stashMap = new Map<string, StashEntry>();
    for (const row of stashData ?? []) {
      const cat = row.yarn_catalog as { id: string; name: string; brand: string | null; weight: string | null; color_hex: string | null; colorway: string | null } | null;
      if (!cat) continue;
      const qty = parseFloat(String(row.quantity ?? 0));
      const yards = toYards(qty, row.unit);
      const weight = normaliseWeight(cat.weight);
      const approxYpg = weight ? APPROX_YARDS_PER_GRAM[weight] : null;
      const effectiveYards = yards ?? (approxYpg ? Math.round(qty * approxYpg) : 0);
      const isGramOnly = yards === null;

      if (stashMap.has(cat.id)) {
        const existing = stashMap.get(cat.id)!;
        existing.total_yards += effectiveYards;
        if (isGramOnly) existing.has_gram_only = true;
      } else {
        stashMap.set(cat.id, {
          yarn_catalog_id: cat.id,
          name: cat.name,
          brand: cat.brand,
          weight: weight,
          color_hex: cat.color_hex,
          colorway: cat.colorway,
          total_yards: effectiveYards,
          has_gram_only: isGramOnly,
        });
      }
    }

    const stashList = Array.from(stashMap.values());
    setStash(stashList);

    // Fetch all patterns not already in an active project
    const { data: activeProjectPatterns } = await supabase
      .from('projects')
      .select('pattern_id')
      .in('status', ['active', 'paused']);
    const activePatternIds = new Set((activeProjectPatterns ?? []).map(p => p.pattern_id).filter(Boolean));

    const { data: patterns } = await supabase
      .from('patterns')
      .select('id, name, yarn_weight, difficulty, category, notes, yarn_quantity')
      .order('name');

    const results: Match[] = [];

    for (const pattern of patterns ?? []) {
      if (activePatternIds.has(pattern.id)) continue; // already being knitted

      const normWeight = normaliseWeight(pattern.yarn_weight);

      // Find stash entries that match this pattern's weight
      const weightMatches = stashList.filter(s =>
        s.weight && normWeight && s.weight === normWeight
      );

      // Get the required yardage — take the minimum amount from yarn_quantity entries
      // (some patterns list per-size, we take the smallest size as the baseline)
      let requiredYards: number | null = null;
      if (pattern.yarn_quantity && pattern.yarn_quantity.length > 0) {
        const yardageEntries = (pattern.yarn_quantity as YarnQty[])
          .map(q => toYards(q.amount, q.unit))
          .filter((y): y is number => y !== null);
        if (yardageEntries.length > 0) {
          requiredYards = Math.min(...yardageEntries);
        }
      }

      // No weight in pattern and no stash data — skip
      if (!normWeight && weightMatches.length === 0) continue;

      // Find best matching stash entry
      const bestMatch = weightMatches.reduce<StashEntry | null>((best, s) => {
        if (!best) return s;
        return s.total_yards > best.total_yards ? s : best;
      }, null);

      const availableYards = bestMatch?.total_yards ?? null;

      const reasons: string[] = [];
      const concerns: string[] = [];
      let rating: Match['rating'] = 'partial';

      if (bestMatch) {
        reasons.push(`Weight match: ${normWeight}`);
      } else if (normWeight) {
        concerns.push(`No ${normWeight} yarn in stash`);
      }

      if (requiredYards !== null && availableYards !== null) {
        if (availableYards >= requiredYards) {
          reasons.push(`Enough yarn: ${availableYards.toLocaleString()} yds available, ${requiredYards.toLocaleString()} needed`);
          rating = bestMatch ? 'great' : 'possible';
        } else {
          const short = requiredYards - availableYards;
          concerns.push(`Short by ~${short.toLocaleString()} yds`);
          rating = 'possible';
        }
      } else if (requiredYards === null) {
        reasons.push('No yardage specified — weight match only');
        rating = bestMatch ? 'possible' : 'partial';
      } else if (availableYards === null) {
        concerns.push('No matching yarn in stash');
        rating = 'partial';
      }

      if (bestMatch?.has_gram_only) {
        concerns.push('Yardage estimated from weight (grams only in stash)');
      }

      // Only include patterns where there's at least a weight match or a plausible path
      if (rating === 'partial' && !bestMatch) continue;

      // Upgrade to 'great' if weight matches AND yardage is sufficient
      if (bestMatch && availableYards !== null && requiredYards !== null && availableYards >= requiredYards) {
        rating = 'great';
      } else if (bestMatch && (requiredYards === null || (availableYards !== null && availableYards >= requiredYards * 0.8))) {
        rating = 'possible';
      } else if (bestMatch) {
        rating = 'partial';
      }

      results.push({ pattern, rating, matchedYarn: bestMatch, requiredYards, availableYards, reasons, concerns });
    }

    // Sort: great → possible → partial, then by pattern name
    const order = { great: 0, possible: 1, partial: 2 };
    results.sort((a, b) => order[a.rating] - order[b.rating] || a.pattern.name.localeCompare(b.pattern.name));

    setMatches(results);
    setLoading(false);
  }

  const RATING_COLORS = {
    great:    { bg: 'var(--badge-active-bg)',    text: 'var(--badge-active-text)',    label: 'Great match' },
    possible: { bg: 'var(--badge-paused-bg)',    text: 'var(--badge-paused-text)',    label: 'Possible' },
    partial:  { bg: 'var(--badge-frogged-bg)',   text: 'var(--badge-frogged-text)',   label: 'Partial' },
  };

  const allWeights = Array.from(new Set(stash.map(s => s.weight).filter(Boolean))) as string[];

  const filtered = matches.filter(m => {
    if (filter !== 'all' && m.rating !== filter) return false;
    if (weightFilter !== 'all' && normaliseWeight(m.pattern.yarn_weight) !== weightFilter) return false;
    return true;
  });

  const greatCount   = matches.filter(m => m.rating === 'great').length;
  const possibleCount = matches.filter(m => m.rating === 'possible').length;

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 6 }}>What Should I Knit Next?</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Patterns from your library matched against your in-stock stash.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)', fontSize: 14 }}>
          Checking your stash against your patterns…
        </div>
      ) : matches.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>🧶</p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>Nothing to match yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add some patterns to your library and yarn to your stash, then come back here.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {greatCount > 0 && (
              <div style={{ background: 'var(--badge-active-bg)', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
                <p style={{ color: 'var(--badge-active-text)', fontSize: 22, fontWeight: 800 }}>{greatCount}</p>
                <p style={{ color: 'var(--badge-active-text)', fontSize: 12, opacity: 0.8 }}>great matches</p>
              </div>
            )}
            {possibleCount > 0 && (
              <div style={{ background: 'var(--badge-paused-bg)', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
                <p style={{ color: 'var(--badge-paused-text)', fontSize: 22, fontWeight: 800 }}>{possibleCount}</p>
                <p style={{ color: 'var(--badge-paused-text)', fontSize: 12, opacity: 0.8 }}>possible matches</p>
              </div>
            )}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
              <p style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 800 }}>{matches.length}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>patterns checked</p>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {(['all', 'great', 'possible', 'partial'] as const).map(r => (
              <button key={r} onClick={() => setFilter(r)} style={{
                padding: '5px 12px', borderRadius: 16, border: '1px solid',
                borderColor: filter === r ? 'var(--primary)' : 'var(--border-medium)',
                background: filter === r ? 'var(--primary)' : 'transparent',
                color: filter === r ? 'var(--primary-text)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
              }}>
                {r === 'all' ? `All (${matches.length})` : `${r === 'great' ? '✓ ' : ''}${r} (${matches.filter(m => m.rating === r).length})`}
              </button>
            ))}
            {allWeights.length > 1 && (
              <select value={weightFilter} onChange={e => setWeightFilter(e.target.value)} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-medium)',
                borderRadius: 16, padding: '5px 12px', color: 'var(--text-muted)',
                fontSize: 12, cursor: 'pointer', marginLeft: 'auto',
              }}>
                <option value="all">All weights</option>
                {allWeights.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            )}
          </div>

          {/* Results */}
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: 14, textAlign: 'center', padding: 32 }}>No matches for these filters.</p>
          ) : filtered.map(m => {
            const rc = RATING_COLORS[m.rating];
            return (
              <div key={m.pattern.id} className="card" style={{ cursor: 'default', marginBottom: 10 }}
                onClick={() => navigate('/patterns')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{m.pattern.name}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {m.pattern.yarn_weight && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.pattern.yarn_weight}</span>}
                      {m.pattern.difficulty && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {m.pattern.difficulty}</span>}
                      {m.pattern.category && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {m.pattern.category}</span>}
                    </div>
                  </div>
                  <span style={{ background: rc.bg, color: rc.text, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {rc.label}
                  </span>
                </div>

                {/* Matched yarn */}
                {m.matchedYarn && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 10px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                    {m.matchedYarn.color_hex && (
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: m.matchedYarn.color_hex, flexShrink: 0, border: '1px solid var(--border-light)' }} />
                    )}
                    <span style={{ fontSize: 13, color: 'var(--text-body)', fontWeight: 500 }}>
                      {m.matchedYarn.colorway ?? m.matchedYarn.name}
                    </span>
                    {m.matchedYarn.brand && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>· {m.matchedYarn.brand}</span>}
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                      ~{m.availableYards?.toLocaleString()} yds available
                    </span>
                  </div>
                )}

                {/* Reasons and concerns */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.reasons.map(r => (
                    <span key={r} style={{ fontSize: 11, color: 'var(--badge-active-text)', background: 'var(--badge-active-bg)', borderRadius: 4, padding: '2px 7px' }}>{r}</span>
                  ))}
                  {m.concerns.map(c => (
                    <span key={c} style={{ fontSize: 11, color: 'var(--badge-frogged-text)', background: 'var(--badge-frogged-bg)', borderRadius: 4, padding: '2px 7px' }}>{c}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
