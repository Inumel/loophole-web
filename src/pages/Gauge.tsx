import { useState, useEffect } from 'react';
import { getPref } from '../lib/prefs';

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

// Long tail cast on: inches_per_stitch = (2 / WPI) × (needle_mm / 4)
// tail_inches = (stitches × inches_per_stitch) + 6" buffer
function calcTail(stitches: number, wpi: number, needleMm: number): { inches: number; cm: number } {
  const inchesPerStitch = (2 / wpi) * (needleMm / 4);
  const inches = stitches * inchesPerStitch + 6;
  return { inches: Math.ceil(inches), cm: Math.ceil(inches * 2.54) };
}

export default function GaugePage() {
  const [tab, setTab] = useState<'gauge' | 'needles' | 'castonTail' | 'yardage'>('gauge');
  const [needleSearch, setNeedleSearch] = useState('');

  const [patternSts, setPatternSts] = useState('');
  const [patternRows, setPatternRows] = useState('');
  const [patternUnit, setPatternUnit] = useState(() => getPref('DEFAULT_GAUGE_UNIT'));
  const [needleSystem] = useState(() => getPref('PREFERRED_NEEDLE_SYSTEM'));
  const [yourSts, setYourSts] = useState('');
  const [yourRows, setYourRows] = useState('');
  const [originalSts, setOriginalSts] = useState('');
  const [originalRows, setOriginalRows] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  // Cast on tail state
  const [tailStitches, setTailStitches] = useState('');
  const [tailWpi, setTailWpi] = useState('');
  const [tailNeedle, setTailNeedle] = useState('');
  const [tailNeedleInput, setTailNeedleInput] = useState('custom');
  const [tailResult, setTailResult] = useState<{ inches: number; cm: number } | null>(null);

  // Yardage calculator state
  const [yardageShape, setYardageShape] = useState<'rectangle' | 'triangle' | 'circle'>('rectangle');
  const [yardageUnit, setYardageUnit] = useState<'in' | 'cm'>('in');
  const [yardageW, setYardageW] = useState('');
  const [yardageH, setYardageH] = useState('');
  const [yardageR, setYardageR] = useState('');
  const [yardageSts, setYardageSts] = useState('');
  const [yardageRows, setYardageRows] = useState('');
  const [yardageGaugeUnit, setYardageGaugeUnit] = useState<'10cm' | '4in'>('10cm');
  const [yardageResult, setYardageResult] = useState<{ yards: number; meters: number; skeins50: number; skeins100: number } | null>(null);

  function calcYardage() {
    const sts = parseFloat(yardageSts);
    const rows = parseFloat(yardageRows);
    if (!sts || !rows) return;

    // Convert gauge to stitches/rows per cm
    const gaugeBlock = yardageGaugeUnit === '10cm' ? 10 : 10.16; // 4in in cm
    const stsPer1cm = sts / gaugeBlock;
    const rowsPer1cm = rows / gaugeBlock;

    // Get dimensions in cm
    const toCm = (v: string) => yardageUnit === 'in' ? parseFloat(v) * 2.54 : parseFloat(v);
    const w = toCm(yardageW);
    const h = toCm(yardageH);
    const r = toCm(yardageR);

    // Calculate area in stitches × rows
    let totalSts = 0;
    let totalRows = 0;
    if (yardageShape === 'rectangle') {
      totalSts = w * stsPer1cm;
      totalRows = h * rowsPer1cm;
    } else if (yardageShape === 'triangle') {
      // Half the area of the bounding rectangle
      totalSts = w * stsPer1cm;
      totalRows = (h * rowsPer1cm) / 2;
    } else {
      // Circle: area = π r²
      const areaCm2 = Math.PI * r * r;
      // Approximate as square root for dimensions
      const side = Math.sqrt(areaCm2);
      totalSts = side * stsPer1cm;
      totalRows = side * rowsPer1cm;
    }

    // Each stitch-row uses approximately 3× the stitch width in yarn
    // Stitch width ≈ 1/stsPer1cm cm, yarn length per stitch ≈ 3× that
    const stitchWidthCm = 1 / stsPer1cm;
    const yarnPerStitchCm = stitchWidthCm * 3;
    const totalYarnCm = totalSts * totalRows * yarnPerStitchCm;
    // Add 15% ease/waste
    const totalWithEase = totalYarnCm * 1.15;
    const yards = Math.ceil(totalWithEase / 91.44);
    const meters = Math.ceil(totalWithEase / 100);

    setYardageResult({
      yards,
      meters,
      skeins50: Math.ceil(yards / 54), // ~50g skein ≈ 54 yards worsted
      skeins100: Math.ceil(yards / 109), // ~100g skein ≈ 109 yards worsted
    });
  }

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
        {(['gauge', 'needles', 'castonTail', 'yardage'] as const).map(t => (
          <button key={t} onClick={() => setTab(t as typeof tab)} style={{
            padding: '10px 16px', border: 'none', background: 'transparent',
            color: tab === t ? '#7C3AED' : '#9CA3AF', cursor: 'pointer', fontSize: 13,
            fontWeight: tab === t ? 700 : 500,
            borderBottom: `2px solid ${tab === t ? '#7C3AED' : 'transparent'}`,
            marginBottom: -1, whiteSpace: 'nowrap',
          }}>
            {t === 'gauge' ? 'Gauge' : t === 'needles' ? 'Needles' : t === 'castonTail' ? 'Cast On Tail' : 'Yardage'}
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
      ) : tab === 'needles' ? (
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
              {[['Metric (mm)', 'metric'], ['US', 'US'], ['UK / Canadian', 'UK']].map(([h, sys]) => (
                <span key={h} style={{ color: needleSystem === sys ? '#A78BFA' : '#9CA3AF', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{h}</span>
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
                  <span style={{ color: needleSystem === 'metric' ? '#F9FAFB' : '#A78BFA', fontWeight: needleSystem === 'metric' ? 700 : 600, fontSize: 15 }}>{n.metric} mm</span>
                  <span style={{ color: needleSystem === 'US' ? '#F9FAFB' : '#9CA3AF', fontWeight: needleSystem === 'US' ? 700 : 400, fontSize: 15 }}>{n.us}</span>
                  <span style={{ color: needleSystem === 'UK' ? '#F9FAFB' : '#9CA3AF', fontWeight: needleSystem === 'UK' ? 700 : 400, fontSize: 15 }}>{n.uk}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* Cast On Tail Calculator */
        <>
          <p style={{ color: '#9CA3AF', marginBottom: 24, fontSize: 14 }}>
            Calculate how long a tail you need for a long tail cast on, based on your yarn and needle size.
          </p>

          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 4 }}>Stitch count</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 12 }}>How many stitches are you casting on?</p>
            <input style={{ ...inp, textAlign: 'left', maxWidth: 200 }}
              value={tailStitches} onChange={e => { setTailStitches(e.target.value); setTailResult(null); }}
              placeholder="e.g. 80" type="number" />
          </div>

          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 4 }}>WPI (wraps per inch)</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 12 }}>Wrap your yarn around a ruler — count how many wraps fit in 1 inch.</p>
            <input style={{ ...inp, textAlign: 'left', maxWidth: 200 }}
              value={tailWpi} onChange={e => { setTailWpi(e.target.value); setTailResult(null); }}
              placeholder="e.g. 14" type="number" />
            <div style={{ marginTop: 16 }}>
              <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 8 }}>Common WPI ranges by weight:</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Lace', wpi: '30+' }, { label: 'Fingering', wpi: '14–18' },
                  { label: 'Sport', wpi: '12–14' }, { label: 'DK', wpi: '11–13' },
                  { label: 'Worsted', wpi: '9–11' }, { label: 'Aran', wpi: '7–9' },
                  { label: 'Bulky', wpi: '5–7' }, { label: 'Super Bulky', wpi: '1–4' },
                ].map(({ label, wpi: range }) => (
                  <div key={label} style={{ background: '#374151', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                    <span style={{ color: '#A78BFA', fontWeight: 600 }}>{label}</span>
                    <span style={{ color: '#6B7280' }}> {range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 4 }}>Needle size</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 12 }}>Pick a common size or enter a custom diameter.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '8.0', '9.0', '10.0', '12.0'].map(mm => (
                <button key={mm} onClick={() => { setTailNeedleInput(mm); setTailNeedle(mm); setTailResult(null); }} style={{
                  padding: '5px 10px', borderRadius: 8, border: '1px solid',
                  borderColor: tailNeedleInput === mm ? '#7C3AED' : '#374151',
                  background: tailNeedleInput === mm ? '#7C3AED' : 'transparent',
                  color: tailNeedleInput === mm ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                }}>{mm} mm</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#6B7280', fontSize: 13 }}>Custom:</span>
              <input
                style={{ ...inp, textAlign: 'left', maxWidth: 120 }}
                value={tailNeedleInput === 'custom' ? tailNeedle : (tailNeedleInput !== tailNeedle ? tailNeedle : '')}
                onChange={e => { setTailNeedle(e.target.value); setTailNeedleInput('custom'); setTailResult(null); }}
                placeholder="mm"
                type="number"
              />
              <span style={{ color: '#6B7280', fontSize: 13 }}>mm</span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ marginBottom: 20, opacity: (!tailStitches || !tailWpi || !tailNeedle) ? 0.5 : 1 }}
            disabled={!tailStitches || !tailWpi || !tailNeedle}
            onClick={() => {
              const s = parseFloat(tailStitches);
              const w = parseFloat(tailWpi);
              const n = parseFloat(tailNeedle);
              if (s > 0 && w > 0 && n > 0) setTailResult(calcTail(s, w, n));
            }}
          >
            Calculate Tail Length
          </button>

          {tailResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#1F2937', borderRadius: 16, padding: 28, textAlign: 'center' }}>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>Leave a tail of at least</p>
                <p style={{ color: '#F9FAFB', fontSize: 52, fontWeight: 700, lineHeight: 1 }}>{tailResult.inches}"</p>
                <p style={{ color: '#A78BFA', fontSize: 20, fontWeight: 600, marginTop: 4 }}>{tailResult.cm} cm</p>
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 12 }}>Includes 6" extra to weave in the end</p>
              </div>
              <div style={{ background: '#1a2540', borderRadius: 12, padding: 16, borderLeft: '3px solid #7C3AED' }}>
                <p style={{ color: '#F9FAFB', fontWeight: 600, marginBottom: 6 }}>💡 Tip</p>
                <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6 }}>
                  When in doubt, add a little extra — running out of tail mid-cast-on means starting over.
                  For very large stitch counts, cut a long tail and fold it in half to find the midpoint first.
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Yardage Calculator */
        <>
          <p style={{ color: '#9CA3AF', marginBottom: 24, fontSize: 14 }}>
            Estimate how much yarn you need based on your finished dimensions and gauge.
          </p>

          {/* Shape */}
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 12 }}>Project shape</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['rectangle', 'triangle', 'circle'] as const).map(s => (
                <button key={s} onClick={() => { setYardageShape(s); setYardageResult(null); }} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, border: '1px solid',
                  borderColor: yardageShape === s ? '#7C3AED' : '#374151',
                  background: yardageShape === s ? '#7C3AED' : 'transparent',
                  color: yardageShape === s ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 13,
                }}>
                  {s === 'rectangle' ? '▭ Rectangle / Square' : s === 'triangle' ? '△ Triangle' : '○ Circle'}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="card-title">Finished dimensions</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['in', 'cm'] as const).map(u => (
                  <button key={u} onClick={() => { setYardageUnit(u); setYardageResult(null); }} style={{
                    padding: '4px 12px', borderRadius: 8, border: '1px solid',
                    borderColor: yardageUnit === u ? '#7C3AED' : '#374151',
                    background: yardageUnit === u ? '#7C3AED' : 'transparent',
                    color: yardageUnit === u ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 13,
                  }}>{u}</button>
                ))}
              </div>
            </div>
            {yardageShape === 'circle' ? (
              <div style={{ maxWidth: 200 }}>
                <label style={lbl}>Radius ({yardageUnit})</label>
                <input style={inp} value={yardageR}
                  onChange={e => { setYardageR(e.target.value); setYardageResult(null); }}
                  placeholder="e.g. 6" type="number" />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Width ({yardageUnit})</label>
                  <input style={inp} value={yardageW}
                    onChange={e => { setYardageW(e.target.value); setYardageResult(null); }}
                    placeholder={yardageShape === 'triangle' ? 'Base' : 'Width'} type="number" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Height ({yardageUnit})</label>
                  <input style={inp} value={yardageH}
                    onChange={e => { setYardageH(e.target.value); setYardageResult(null); }}
                    placeholder="Height" type="number" />
                </div>
              </div>
            )}
          </div>

          {/* Gauge */}
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 12 }}>Your gauge</p>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Stitches</label>
                <input style={inp} value={yardageSts}
                  onChange={e => { setYardageSts(e.target.value); setYardageResult(null); }}
                  placeholder="e.g. 20" type="number" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Rows</label>
                <input style={inp} value={yardageRows}
                  onChange={e => { setYardageRows(e.target.value); setYardageResult(null); }}
                  placeholder="e.g. 28" type="number" />
              </div>
              <div>
                <label style={lbl}>Per</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(['10cm', '4in'] as const).map(u => (
                    <button key={u} onClick={() => { setYardageGaugeUnit(u); setYardageResult(null); }} style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid',
                      borderColor: yardageGaugeUnit === u ? '#7C3AED' : '#374151',
                      background: yardageGaugeUnit === u ? '#7C3AED' : 'transparent',
                      color: yardageGaugeUnit === u ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                    }}>{u}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={calcYardage}
            disabled={!yardageSts || !yardageRows || (yardageShape === 'circle' ? !yardageR : !yardageW || !yardageH)}
            style={{ marginBottom: 20, opacity: (!yardageSts || !yardageRows) ? 0.5 : 1 }}>
            Calculate Yardage
          </button>

          {yardageResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#1F2937', borderRadius: 16, padding: 28, textAlign: 'center' }}>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>Estimated yarn needed</p>
                <p style={{ color: '#F9FAFB', fontSize: 52, fontWeight: 700, lineHeight: 1 }}>{yardageResult.yards}</p>
                <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 2 }}>yards</p>
                <p style={{ color: '#A78BFA', fontSize: 20, fontWeight: 600, marginTop: 8 }}>{yardageResult.meters} m</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#1F2937', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <p style={{ color: '#F9FAFB', fontSize: 28, fontWeight: 700 }}>{yardageResult.skeins50}</p>
                  <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>skeins (50g / ~54 yds)</p>
                </div>
                <div style={{ background: '#1F2937', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <p style={{ color: '#F9FAFB', fontSize: 28, fontWeight: 700 }}>{yardageResult.skeins100}</p>
                  <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>skeins (100g / ~109 yds)</p>
                </div>
              </div>
              <div style={{ background: '#1a2540', borderRadius: 12, padding: 16, borderLeft: '3px solid #7C3AED' }}>
                <p style={{ color: '#F9FAFB', fontWeight: 600, marginBottom: 6 }}>💡 Note</p>
                <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6 }}>
                  This estimate includes a 15% buffer for seams, finishing, and swatch waste.
                  Skein sizes assume worsted weight — adjust if using a different weight.
                  Always buy one extra skein if possible, especially for hand-dyed yarn where dye lots vary.
                </p>
              </div>
            </div>
          )}
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
