import { useState } from 'react';

type Result = {
  stitchScale: number;
  rowScale: number;
  adjustedStitches: number | null;
  adjustedRows: number | null;
  stitchDiff: number;
  rowDiff: number;
};

const NEEDLE_SIZES = [
  { metric: '2.0', us: '0', uk: '14' },
  { metric: '2.25', us: '1', uk: '13' },
  { metric: '2.5', us: '—', uk: '12' },
  { metric: '2.75', us: '2', uk: '12' },
  { metric: '3.0', us: '—', uk: '11' },
  { metric: '3.25', us: '3', uk: '10' },
  { metric: '3.5', us: '4', uk: '—' },
  { metric: '3.75', us: '5', uk: '9' },
  { metric: '4.0', us: '6', uk: '8' },
  { metric: '4.5', us: '7', uk: '7' },
  { metric: '5.0', us: '8', uk: '6' },
  { metric: '5.5', us: '9', uk: '5' },
  { metric: '6.0', us: '10', uk: '4' },
  { metric: '6.5', us: '10.5', uk: '3' },
  { metric: '7.0', us: '—', uk: '2' },
  { metric: '7.5', us: '—', uk: '1' },
  { metric: '8.0', us: '11', uk: '0' },
  { metric: '9.0', us: '13', uk: '00' },
  { metric: '10.0', us: '15', uk: '000' },
  { metric: '12.0', us: '17', uk: '—' },
  { metric: '15.0', us: '19', uk: '—' },
  { metric: '19.0', us: '35', uk: '—' },
  { metric: '25.0', us: '50', uk: '—' },
];

export default function GaugePage() {
  const [tab, setTab] = useState<'gauge' | 'needles'>('gauge');
  const [needleSearch, setNeedleSearch] = useState('');

  const [patternSts, setPatternSts] = useState('');
  const [patternRows, setPatternRows] = useState('');
  const [patternUnit, setPatternUnit] = useState('10cm');
  const [yourSts, setYourSts] = useState('');
  const [yourRows, setYourRows] = useState('');
  const [originalSts, setOriginalSts] = useState('');
  const [originalRows, setOriginalRows] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  function calculate() {
    const pSts = parseFloat(patternSts);
    const pRows = parseFloat(patternRows);
    const ySts = parseFloat(yourSts);
    const yRows = parseFloat(yourRows);
    if (!pSts || !ySts) return;
    const stitchScale = pSts / ySts;
    const rowScale = pRows && yRows ? pRows / yRows : 1;
    const adjSts = originalSts ? Math.round(parseFloat(originalSts) * stitchScale) : null;
    const adjRows = originalRows ? Math.round(parseFloat(originalRows) * rowScale) : null;
    const stitchDiff = Math.round((stitchScale - 1) * 100);
    const rowDiff = Math.round((rowScale - 1) * 100);
    setResult({ stitchScale, rowScale, adjustedStitches: adjSts, adjustedRows: adjRows, stitchDiff, rowDiff });
  }

  function reset() {
    setPatternSts(''); setPatternRows(''); setYourSts(''); setYourRows('');
    setOriginalSts(''); setOriginalRows(''); setResult(null);
  }

  const diffColor = (d: number) => Math.abs(d) <= 5 ? '#10B981' : Math.abs(d) <= 15 ? '#F59E0B' : '#EF4444';

  const filteredNeedles = needleSearch.trim()
    ? NEEDLE_SIZES.filter(n =>
        n.metric.includes(needleSearch) ||
        n.us.toLowerCase().includes(needleSearch.toLowerCase()) ||
        n.uk.includes(needleSearch)
      )
    : NEEDLE_SIZES;

  return (
    <div style={{ maxWidth: 700 }}>
      <h1>Gauge & Needles</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #374151', marginBottom: 24 }}>
        {(['gauge', 'needles'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', border: 'none', background: 'transparent',
            color: tab === t ? '#7C3AED' : '#9CA3AF', cursor: 'pointer', fontSize: 14,
            fontWeight: tab === t ? 700 : 500,
            borderBottom: `2px solid ${tab === t ? '#7C3AED' : 'transparent'}`,
            marginBottom: -1,
          }}>
            {t === 'gauge' ? 'Gauge Calculator' : 'Needle Size Converter'}
          </button>
        ))}
      </div>

      {tab === 'gauge' ? (
        <>
          <p style={{ color: '#9CA3AF', marginBottom: 24, fontSize: 14 }}>
            Enter your gauge swatch measurements to find out how to adjust a pattern for your yarn.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ cursor: 'default' }}>
              <p className="card-title" style={{ marginBottom: 4 }}>Pattern gauge</p>
              <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>What the pattern calls for</p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Stitches</label>
                  <input style={inp} value={patternSts} onChange={e => setPatternSts(e.target.value)} placeholder="22" type="number" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Rows</label>
                  <input style={inp} value={patternRows} onChange={e => setPatternRows(e.target.value)} placeholder="30" type="number" />
                </div>
                <div>
                  <label style={lbl}>Per</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {['10cm', '4in'].map(u => (
                      <button key={u} onClick={() => setPatternUnit(u)} style={{
                        padding: '6px 10px', borderRadius: 6, border: '1px solid',
                        borderColor: patternUnit === u ? '#7C3AED' : '#374151',
                        background: patternUnit === u ? '#7C3AED' : 'transparent',
                        color: patternUnit === u ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ cursor: 'default' }}>
              <p className="card-title" style={{ marginBottom: 4 }}>Your gauge</p>
              <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>From your actual swatch</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Stitches</label>
                  <input style={inp} value={yourSts} onChange={e => setYourSts(e.target.value)} placeholder="19" type="number" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Rows</label>
                  <input style={inp} value={yourRows} onChange={e => setYourRows(e.target.value)} placeholder="27" type="number" />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 4 }}>
              Adjust pattern counts <span style={{ color: '#6B7280', fontWeight: 400, fontSize: 13 }}>(optional)</span>
            </p>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Enter counts from the pattern to get adjusted numbers</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Pattern stitches</label>
                <input style={inp} value={originalSts} onChange={e => setOriginalSts(e.target.value)} placeholder="e.g. 120" type="number" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Pattern rows</label>
                <input style={inp} value={originalRows} onChange={e => setOriginalRows(e.target.value)} placeholder="e.g. 80" type="number" />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button className="btn btn-primary" onClick={calculate} disabled={!patternSts || !yourSts}
              style={{ opacity: !patternSts || !yourSts ? 0.5 : 1 }}>
              Calculate
            </button>
            {result && <button className="btn btn-secondary" onClick={reset}>Reset</button>}
          </div>

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p className="card-title">Stitch adjustment</p>
                  <span style={{ background: diffColor(result.stitchDiff) + '22', color: diffColor(result.stitchDiff), padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
                    {result.stitchDiff > 0 ? '+' : ''}{result.stitchDiff}%
                  </span>
                </div>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 4 }}>
                  Scale factor: <span style={{ color: '#F9FAFB', fontWeight: 600 }}>{result.stitchScale.toFixed(3)}</span>
                </p>
                {result.adjustedStitches !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#374151', borderRadius: 8, padding: 12, marginTop: 8 }}>
                    <span style={{ color: '#9CA3AF', fontSize: 14, flex: 1 }}>Pattern stitches</span>
                    <span style={{ color: '#7C3AED', fontSize: 18, fontWeight: 700 }}>→</span>
                    <span style={{ color: '#F9FAFB', fontSize: 22, fontWeight: 700 }}>{result.adjustedStitches} sts</span>
                  </div>
                )}
              </div>

              {patternRows && yourRows && (
                <div className="card" style={{ cursor: 'default' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <p className="card-title">Row adjustment</p>
                    <span style={{ background: diffColor(result.rowDiff) + '22', color: diffColor(result.rowDiff), padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
                      {result.rowDiff > 0 ? '+' : ''}{result.rowDiff}%
                    </span>
                  </div>
                  <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 4 }}>
                    Scale factor: <span style={{ color: '#F9FAFB', fontWeight: 600 }}>{result.rowScale.toFixed(3)}</span>
                  </p>
                  {result.adjustedRows !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#374151', borderRadius: 8, padding: 12, marginTop: 8 }}>
                      <span style={{ color: '#9CA3AF', fontSize: 14, flex: 1 }}>Pattern rows</span>
                      <span style={{ color: '#7C3AED', fontSize: 18, fontWeight: 700 }}>→</span>
                      <span style={{ color: '#F9FAFB', fontSize: 22, fontWeight: 700 }}>{result.adjustedRows} rows</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ background: '#1a2540', borderRadius: 12, padding: 16, borderLeft: '3px solid #7C3AED' }}>
                <p style={{ color: '#F9FAFB', fontWeight: 600, marginBottom: 6 }}>💡 Needle advice</p>
                <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6 }}>
                  {Math.abs(result.stitchDiff) <= 5
                    ? 'Your gauge is very close — you should be fine knitting as written.'
                    : result.stitchDiff > 0
                      ? 'Your stitches are tighter than the pattern. Try going up a needle size to loosen your gauge before adjusting stitch counts.'
                      : 'Your stitches are looser than the pattern. Try going down a needle size to tighten your gauge before adjusting stitch counts.'}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ color: '#9CA3AF', marginBottom: 16, fontSize: 14 }}>
            Search by metric (mm), US, or UK size.
          </p>
          <input
            value={needleSearch}
            onChange={e => setNeedleSearch(e.target.value)}
            placeholder="e.g. 4, US 6, or UK 8"
            style={{ ...inp, textAlign: 'left', marginBottom: 16, maxWidth: 300 }}
          />
          <div style={{ background: '#1F2937', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 16px', background: '#374151' }}>
              {['Metric (mm)', 'US', 'UK / Canadian'].map(h => (
                <span key={h} style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {filteredNeedles.length === 0 ? (
              <p style={{ color: '#6B7280', padding: 16, textAlign: 'center' }}>No results for "{needleSearch}"</p>
            ) : (
              filteredNeedles.map((n, i) => (
                <div key={n.metric} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '12px 16px',
                  background: i % 2 === 0 ? 'transparent' : '#1a1f2e',
                  borderTop: '1px solid #374151',
                }}>
                  <span style={{ color: '#A78BFA', fontWeight: 600, fontSize: 15 }}>{n.metric} mm</span>
                  <span style={{ color: '#F9FAFB', fontSize: 15 }}>{n.us}</span>
                  <span style={{ color: '#F9FAFB', fontSize: 15 }}>{n.uk}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', color: '#9CA3AF', fontSize: 12, fontWeight: 500, marginBottom: 6 };
const inp: React.CSSProperties = {
  width: '100%', background: '#374151', border: '1px solid #4B5563',
  borderRadius: 8, padding: '10px 12px', color: '#F9FAFB', fontSize: 15,
  boxSizing: 'border-box', textAlign: 'center',
};
