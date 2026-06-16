import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { explainAbbreviations } from '../lib/claude';

type Abbrev = {
  id: string;
  abbreviation: string;
  explanation: string;
  category: string | null;
};

const CATEGORIES = ['basic', 'cast_on_off', 'increase', 'decrease', 'slip', 'markers', 'cable', 'tools', 'technique', 'finishing', 'measurement', 'auto'];

export default function AbbreviationsPage() {
  const [abbrevs, setAbbrevs] = useState<Abbrev[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lookupText, setLookupText] = useState('');
  const [lookupResult, setLookupResult] = useState<Record<string, string> | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => { fetchAbbrevs(); }, []);

  async function fetchAbbrevs() {
    setLoading(true);
    const { data } = await supabase
      .from('knitting_abbreviations')
      .select('id, abbreviation, explanation, category')
      .order('abbreviation', { ascending: true });
    if (data) setAbbrevs(data);
    setLoading(false);
  }

  async function lookupStep() {
    if (!lookupText.trim()) return;
    setLookingUp(true);
    setLookupResult(null);
    try {
      const words = lookupText.match(/\b[a-z][a-z0-9]*\b/gi) ?? [];
      const { data } = await supabase
        .from('knitting_abbreviations')
        .select('abbreviation, explanation')
        .in('abbreviation', words.map(w => w.toLowerCase()));
      const found: Record<string, string> = {};
      for (const row of data ?? []) found[row.abbreviation] = row.explanation;
      const missing = words.filter(w => !found[w.toLowerCase()]);
      if (missing.length > 0) {
        const claudeResult = await explainAbbreviations(lookupText);
        Object.assign(found, claudeResult);
      }
      setLookupResult(Object.keys(found).length > 0 ? found : {});
    } catch {
      setLookupResult({});
    }
    setLookingUp(false);
  }

  const filtered = abbrevs.filter(a => {
    const matchSearch = !search.trim() ||
      a.abbreviation.toLowerCase().includes(search.toLowerCase()) ||
      a.explanation.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || a.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div>
      <h1>Abbreviations</h1>

      {/* Step lookup */}
      <div className="card" style={{ cursor: 'default', marginBottom: 24 }}>
        <p className="card-title" style={{ marginBottom: 8 }}>Look up a pattern step</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Paste any pattern instruction to find all abbreviations in it.
        </p>
        <textarea
          value={lookupText}
          onChange={e => setLookupText(e.target.value)}
          placeholder="e.g. *K2, p1, ssk, yo; rep from * to end"
          rows={2}
          style={{
            width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)',
            borderRadius: 8, padding: '10px 12px', color: 'var(--text-body)', fontSize: 14,
            resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
          }}
        />
        <button className="btn btn-primary" onClick={lookupStep}
          disabled={lookingUp || !lookupText.trim()}
          style={{ opacity: lookingUp || !lookupText.trim() ? 0.6 : 1 }}>
          {lookingUp ? 'Looking up…' : 'Look up abbreviations'}
        </button>

        {lookupResult !== null && (
          <div style={{ marginTop: 16 }}>
            {Object.keys(lookupResult).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No abbreviations found.</p>
            ) : (
              Object.entries(lookupResult).map(([abbrev, explanation]) => (
                <div key={abbrev} style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginTop: 10 }}>
                  <span style={{ color: 'var(--text-accent)', fontWeight: 700, fontSize: 15, marginRight: 12 }}>
                    {abbrev.toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--text-body)', fontSize: 14 }}>{explanation}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search abbreviations…"
          style={{
            flex: 1, minWidth: 200, background: 'var(--bg-input)', border: '1px solid var(--border-input)',
            borderRadius: 8, padding: '10px 12px', color: 'var(--text-body)', fontSize: 14,
          }}
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8,
            padding: '10px 12px', color: 'var(--text-body)', fontSize: 14, cursor: 'pointer',
          }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        {filtered.length} abbreviation{filtered.length !== 1 ? 's' : ''}
        {search || categoryFilter ? ' (filtered)' : ' in database'}
      </p>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 130px', padding: '10px 16px', background: 'var(--bg-accent)' }}>
            {['Abbreviation', 'Explanation', 'Category'].map(h => (
              <span key={h} style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', padding: 16, textAlign: 'center' }}>No results.</p>
          ) : (
            filtered.map((a, i) => (
              <div key={a.id} style={{
                display: 'grid', gridTemplateColumns: '120px 1fr 130px',
                padding: '12px 16px', borderTop: '1px solid var(--border-light)',
                background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)',
              }}>
                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14 }}>
                  {a.abbreviation.toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.5 }}>{a.explanation}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                  {a.category?.replace(/_/g, ' ') ?? '—'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
