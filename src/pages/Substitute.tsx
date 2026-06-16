import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Pattern = {
  id: string;
  name: string;
  yarn_weight: string | null;
  needle_size: string | null;
  gauge_stitches: number | null;
  gauge_unit: string | null;
  yarn_quantity: Array<{ amount: number; unit: string; color?: string; size?: string }> | null;
};

type StashYarn = {
  id: string;
  name: string;
  brand: string | null;
  colorway: string | null;
  color_hex: string | null;
  weight: string | null;
  fiber: string | null;
  quantity: number | null;
  unit: string;
  status: string;
};

type Suggestion = {
  yarn_id: string;
  yarn_name: string;
  colorway: string | null;
  brand: string | null;
  color_hex: string | null;
  rating: 'excellent' | 'good' | 'possible';
  quantity_available: number | null;
  quantity_unit: string;
  quantity_sufficient: boolean | null;
  reasons: string[];
  concerns: string[];
};

type SubstitutionResult = {
  summary: string;
  suggestions: Suggestion[];
  notes: string;
};

const WEIGHT_ORDER = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];

function weightsCompatible(a: string | null, b: string | null): 'exact' | 'adjacent' | 'incompatible' {
  if (!a || !b) return 'possible' as 'adjacent';
  const ai = WEIGHT_ORDER.findIndex(w => a.toLowerCase().includes(w.toLowerCase()));
  const bi = WEIGHT_ORDER.findIndex(w => b.toLowerCase().includes(w.toLowerCase()));
  if (ai === -1 || bi === -1) return 'adjacent';
  if (ai === bi) return 'exact';
  if (Math.abs(ai - bi) === 1) return 'adjacent';
  return 'incompatible';
}

function totalYardageNeeded(yarn_quantity: Pattern['yarn_quantity']): number | null {
  if (!yarn_quantity || yarn_quantity.length === 0) return null;
  const yardsEntries = yarn_quantity.filter(y => y.unit === 'yards');
  if (yardsEntries.length === 0) return null;
  // If multiple entries for same color across sizes, take the max (largest size)
  const byColor: Record<string, number> = {};
  for (const y of yardsEntries) {
    const key = y.color ?? 'MC';
    byColor[key] = Math.max(byColor[key] ?? 0, y.amount);
  }
  return Object.values(byColor).reduce((sum, v) => sum + v, 0);
}

function toYards(quantity: number | null, unit: string): number | null {
  if (quantity == null) return null;
  if (unit === 'yards') return quantity;
  if (unit === 'meters') return Math.round(quantity * 1.094);
  return null; // g/oz/skeins can't be reliably converted without more info
}

export default function SubstitutePage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [stash, setStash] = useState<StashYarn[]>([]);
  const [loading, setLoading] = useState(true);

  // Pattern selection
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [patternSearch, setPatternSearch] = useState('');
  const [showPatternPicker, setShowPatternPicker] = useState(false);

  // Manual override fields
  const [manualWeight, setManualWeight] = useState('');
  const [manualYardage, setManualYardage] = useState('');
  const [manualFiber, setManualFiber] = useState('');
  const [manualGauge, setManualGauge] = useState('');

  // Results
  const [result, setResult] = useState<SubstitutionResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('patterns').select('id, name, yarn_weight, needle_size, gauge_stitches, gauge_unit, yarn_quantity').order('name'),
      supabase.from('yarn_stash').select('id, name, brand, colorway, color_hex, weight, fiber, quantity, unit, status').eq('status', 'in_stock').order('name'),
    ]).then(([pRes, sRes]) => {
      if (pRes.data) setPatterns(pRes.data);
      if (sRes.data) setStash(sRes.data);
      setLoading(false);
    });
  }, []);

  const filteredPatterns = patternSearch.trim()
    ? patterns.filter(p => p.name.toLowerCase().includes(patternSearch.toLowerCase()))
    : patterns;

  function buildSuggestionsLocally(): SubstitutionResult {
    const targetWeight = manualWeight || selectedPattern?.yarn_weight || null;
    const targetYards = manualYardage ? parseInt(manualYardage) : totalYardageNeeded(selectedPattern?.yarn_quantity ?? null);
    const targetFiber = manualFiber || null;

    const suggestions: Suggestion[] = stash.map(yarn => {
      const reasons: string[] = [];
      const concerns: string[] = [];

      // Weight compatibility
      const weightCompat = weightsCompatible(targetWeight, yarn.weight);
      if (weightCompat === 'exact') reasons.push(`Exact weight match (${yarn.weight})`);
      else if (weightCompat === 'adjacent') {
        reasons.push(`Adjacent weight (${yarn.weight} vs ${targetWeight}) — may work with needle adjustment`);
        concerns.push('Weight differs by one category — swatch carefully');
      } else if (targetWeight && yarn.weight) {
        concerns.push(`Weight mismatch (${yarn.weight} vs ${targetWeight}) — significant gauge adjustment needed`);
      }

      // Yardage check
      const availableYards = toYards(yarn.quantity, yarn.unit);
      let quantity_sufficient: boolean | null = null;
      if (targetYards && availableYards !== null) {
        quantity_sufficient = availableYards >= targetYards;
        if (quantity_sufficient) {
          reasons.push(`Sufficient yardage (${availableYards} yds available, ${targetYards} yds needed)`);
        } else {
          concerns.push(`Insufficient yardage (${availableYards} yds available, ${targetYards} yds needed)`);
        }
      } else if (targetYards && availableYards === null) {
        concerns.push(`Can't verify yardage — quantity stored in ${yarn.unit}, not yards`);
      }

      // Fiber notes
      if (targetFiber && yarn.fiber) {
        const targetLower = targetFiber.toLowerCase();
        const yarnLower = yarn.fiber.toLowerCase();
        if (yarnLower.includes(targetLower) || targetLower.includes(yarnLower)) {
          reasons.push(`Fiber match (${yarn.fiber})`);
        } else {
          const isMerino = yarnLower.includes('merino') || targetLower.includes('merino');
          const isWool = yarnLower.includes('wool') || targetLower.includes('wool');
          if (isMerino && isWool) {
            reasons.push(`Similar fiber — merino is a type of wool`);
          } else {
            concerns.push(`Different fiber (yours: ${yarn.fiber}, pattern: ${targetFiber})`);
          }
        }
      } else if (yarn.fiber) {
        reasons.push(`Fiber: ${yarn.fiber}`);
      }

      // Rating
      const hasWeightIssue = weightCompat === 'incompatible';
      const hasYardageIssue = quantity_sufficient === false;
      let rating: Suggestion['rating'] = 'excellent';
      if (hasWeightIssue) rating = 'possible';
      else if (hasYardageIssue || weightCompat === 'adjacent') rating = 'good';
      if (reasons.length === 0) reasons.push('In your stash');

      return {
        yarn_id: yarn.id,
        yarn_name: yarn.name,
        colorway: yarn.colorway,
        brand: yarn.brand,
        color_hex: yarn.color_hex,
        rating,
        quantity_available: yarn.quantity,
        quantity_unit: yarn.unit,
        quantity_sufficient,
        reasons,
        concerns,
      };
    });

    // Sort: excellent first, then good, then possible; within each group sort by fewer concerns
    suggestions.sort((a, b) => {
      const order = { excellent: 0, good: 1, possible: 2 };
      if (order[a.rating] !== order[b.rating]) return order[a.rating] - order[b.rating];
      return a.concerns.length - b.concerns.length;
    });

    const excellentCount = suggestions.filter(s => s.rating === 'excellent').length;
    const goodCount = suggestions.filter(s => s.rating === 'good').length;

    return {
      summary: excellentCount > 0
        ? `Found ${excellentCount} excellent match${excellentCount > 1 ? 'es' : ''} in your stash.`
        : goodCount > 0
          ? `No exact matches, but ${goodCount} good option${goodCount > 1 ? 's' : ''} worth swatching.`
          : 'No close matches found — you may need to shop for this one.',
      suggestions,
      notes: targetYards
        ? `Pattern requires approximately ${targetYards} yards${targetWeight ? ` of ${targetWeight} weight yarn` : ''}.`
        : `Pattern weight: ${targetWeight ?? 'unknown'}. Add yardage info for better matching.`,
    };
  }

  function findSubstitutes() {
    if (!selectedPattern && !manualWeight) {
      setError('Please select a pattern or enter yarn requirements manually.');
      return;
    }
    if (stash.length === 0) {
      setError('Your stash is empty — add yarns to get substitution suggestions.');
      return;
    }
    setError('');
    setGenerating(true);
    // Small timeout so the UI updates before the sync calculation
    setTimeout(() => {
      setResult(buildSuggestionsLocally());
      setGenerating(false);
    }, 100);
  }

  const ratingColor = { excellent: '#10B981', good: '#F59E0B', possible: '#6B7280' };
  const ratingLabel = { excellent: '✓ Excellent match', good: '~ Good match', possible: '? Possible' };

  if (loading) return <p style={{ color: '#9CA3AF' }}>Loading…</p>;

  return (
    <div>
      <h1>Yarn Substitution</h1>
      <p style={{ color: '#9CA3AF', marginBottom: 24, fontSize: 14 }}>
        Find yarns in your stash that could substitute for a pattern's requirements.
      </p>

      {/* Pattern picker */}
      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <p className="card-title" style={{ marginBottom: 12 }}>Pattern (optional)</p>
        {selectedPattern ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#F9FAFB', fontSize: 15, fontWeight: 600 }}>{selectedPattern.name}</p>
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                {[selectedPattern.yarn_weight, selectedPattern.needle_size].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button onClick={() => { setSelectedPattern(null); setResult(null); }}
              style={{ background: '#374151', border: 'none', color: '#9CA3AF', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
              Change
            </button>
          </div>
        ) : (
          <div>
            <button onClick={() => setShowPatternPicker(v => !v)} className="btn btn-secondary" style={{ marginBottom: showPatternPicker ? 12 : 0 }}>
              {showPatternPicker ? 'Cancel' : '+ Pick a pattern from your library'}
            </button>
            {showPatternPicker && (
              <div>
                <input value={patternSearch} onChange={e => setPatternSearch(e.target.value)}
                  placeholder="Search patterns…"
                  style={{ width: '100%', background: '#374151', border: '1px solid #4B5563', borderRadius: 8, padding: '8px 12px', color: '#F9FAFB', fontSize: 14, boxSizing: 'border-box', marginBottom: 8 }} />
                <div style={{ maxHeight: 240, overflowY: 'auto', background: '#111827', borderRadius: 8 }}>
                  {filteredPatterns.length === 0
                    ? <p style={{ color: '#6B7280', padding: 12, fontSize: 13 }}>No patterns found.</p>
                    : filteredPatterns.map(p => (
                      <div key={p.id} onClick={() => { setSelectedPattern(p); setShowPatternPicker(false); setPatternSearch(''); setResult(null); }}
                        style={{ padding: '10px 14px', borderBottom: '1px solid #1F2937', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#1F2937')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <p style={{ color: '#F9FAFB', fontSize: 14, fontWeight: 600 }}>{p.name}</p>
                        {(p.yarn_weight || p.yarn_quantity) && (
                          <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                            {[p.yarn_weight, totalYardageNeeded(p.yarn_quantity) ? `~${totalYardageNeeded(p.yarn_quantity)} yds` : null].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual requirements */}
      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <p className="card-title" style={{ marginBottom: 4 }}>Requirements</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 14 }}>
          {selectedPattern ? 'Override the pattern values if needed.' : 'Enter yarn requirements manually.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Yarn weight</label>
            <select value={manualWeight || selectedPattern?.yarn_weight || ''} onChange={e => setManualWeight(e.target.value)} style={sel}>
              <option value="">Any weight</option>
              {['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'].map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Yardage needed</label>
            <input style={inp} value={manualYardage || (totalYardageNeeded(selectedPattern?.yarn_quantity ?? null) ?? '')}
              onChange={e => setManualYardage(e.target.value)}
              placeholder="e.g. 400" type="number" />
          </div>
          <div>
            <label style={lbl}>Fiber (optional)</label>
            <input style={inp} value={manualFiber} onChange={e => setManualFiber(e.target.value)}
              placeholder="e.g. Merino, Cotton, Acrylic" />
          </div>
          <div>
            <label style={lbl}>Gauge (optional)</label>
            <input style={inp} value={manualGauge || (selectedPattern?.gauge_stitches ? `${selectedPattern.gauge_stitches} sts ${selectedPattern.gauge_unit ?? ''}` : '')}
              onChange={e => setManualGauge(e.target.value)}
              placeholder="e.g. 22 sts per 10cm" />
          </div>
        </div>
      </div>

      {/* Stash summary */}
      <div style={{ background: '#1a2540', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#A78BFA', fontSize: 13 }}>🧶</span>
        <p style={{ color: '#9CA3AF', fontSize: 13 }}>
          Searching across <span style={{ color: '#F9FAFB', fontWeight: 600 }}>{stash.length}</span> in-stock yarn{stash.length !== 1 ? 's' : ''} in your stash.
        </p>
      </div>

      {error && (
        <div style={{ background: '#1a1020', border: '1px solid #EF4444', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <p style={{ color: '#EF4444', fontSize: 14 }}>{error}</p>
        </div>
      )}

      <button className="btn btn-primary" onClick={findSubstitutes} disabled={generating}
        style={{ marginBottom: 24, opacity: generating ? 0.6 : 1 }}>
        {generating ? 'Searching…' : '🔍 Find Substitutes'}
      </button>

      {/* Results */}
      {result && (
        <div>
          {/* Summary */}
          <div style={{ background: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>🧶</span>
            <div>
              <p style={{ color: '#F9FAFB', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{result.summary}</p>
              <p style={{ color: '#6B7280', fontSize: 13 }}>{result.notes}</p>
            </div>
          </div>

          {/* Suggestion cards */}
          {result.suggestions.length === 0 ? (
            <p className="empty">No yarns in your stash to compare.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.suggestions.map(s => (
                <div key={s.yarn_id} style={{
                  background: '#1F2937', borderRadius: 12, padding: 16,
                  borderLeft: `3px solid ${ratingColor[s.rating]}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: s.color_hex ?? '#374151', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#F9FAFB', fontSize: 15, fontWeight: 700 }}>
                        {s.colorway ?? s.yarn_name}
                      </p>
                      <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                        {s.yarn_name}{s.brand ? ` · ${s.brand}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ background: ratingColor[s.rating] + '22', color: ratingColor[s.rating], borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                        {ratingLabel[s.rating]}
                      </span>
                      {s.quantity_available != null && (
                        <span style={{ color: s.quantity_sufficient === false ? '#EF4444' : s.quantity_sufficient === true ? '#10B981' : '#9CA3AF', fontSize: 12 }}>
                          {s.quantity_available} {s.quantity_unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {s.reasons.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: s.concerns.length > 0 ? 8 : 0 }}>
                      {s.reasons.map((r, i) => (
                        <p key={i} style={{ color: '#10B981', fontSize: 13 }}>✓ {r}</p>
                      ))}
                    </div>
                  )}
                  {s.concerns.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {s.concerns.map((c, i) => (
                        <p key={i} style={{ color: '#F59E0B', fontSize: 13 }}>⚠ {c}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: '#1a2540', borderRadius: 12, padding: 16, borderLeft: '3px solid #7C3AED', marginTop: 20 }}>
            <p style={{ color: '#F9FAFB', fontWeight: 600, marginBottom: 6 }}>💡 Remember</p>
            <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6 }}>
              Always knit a gauge swatch with your substitute yarn before starting. Even yarns of the same weight can knit up differently depending on fiber, twist, and your tension. A 10cm swatch can save hours of frustration later.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', color: '#9CA3AF', fontSize: 12, fontWeight: 500, marginBottom: 6 };
const inp: React.CSSProperties = {
  width: '100%', background: '#374151', border: '1px solid #4B5563',
  borderRadius: 8, padding: '8px 12px', color: '#F9FAFB', fontSize: 14,
  boxSizing: 'border-box',
};
const sel: React.CSSProperties = {
  width: '100%', background: '#374151', border: '1px solid #4B5563',
  borderRadius: 8, padding: '8px 12px', color: '#F9FAFB', fontSize: 14,
  cursor: 'pointer',
};
