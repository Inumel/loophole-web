import { useState } from 'react';
import { useAuth } from '../lib/auth';

const YARN_WEIGHTS = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];
const OBJECTS = ['Scarf', 'Hat', 'Cowl', 'Shawl', 'Mittens', 'Socks', 'Sweater', 'Cardigan', 'Baby Blanket', 'Dishcloth', 'Other'];
const STYLES = ['Stockinette', 'Garter', 'Ribbing', 'Seed stitch', 'Ribbing with cabling', 'Lace', 'Colorwork', 'Cables', 'Textured'];
const DIFFICULTIES = ['Beginner', 'Easy', 'Intermediate', 'Advanced'];

type PatternSection = {
  title: string;
  content: string;
};

type GeneratedPattern = {
  name: string;
  tagline: string;
  metadata: Record<string, string>;
  abbreviations: Record<string, string>;
  extras?: { title: string; rows: [string, string][] }[];
  stitchPattern?: { title: string; layout: string; note: string };
  sections: PatternSection[];
};

export default function GeneratePage() {
  const { unlocked } = useAuth();
  const [object, setObject] = useState('Scarf');
  const [customObject, setCustomObject] = useState('');
  const [style, setStyle] = useState('Ribbing with cabling');
  const [yarnWeight, setYarnWeight] = useState('Worsted');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [error, setError] = useState('');

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 500 }}>
        <h1>Pattern Generator</h1>
        <div style={{ background: '#1a2540', borderRadius: 12, padding: 20, borderLeft: '3px solid #374151' }}>
          <p style={{ color: '#6B7280', fontSize: 14 }}>
            🔒 This feature requires full access. <a href="/settings" style={{ color: '#7C3AED', textDecoration: 'none' }}>Unlock</a> to use the pattern generator.
          </p>
        </div>
      </div>
    );
  }

  async function generate() {
    const token = sessionStorage.getItem('loophole_token');
    if (!token) { setError('Not authenticated. Please unlock first.'); return; }

    const objectName = object === 'Other' ? customObject.trim() : object;
    if (!objectName) { setError('Please specify what you want to knit.'); return; }

    setGenerating(true);
    setPattern(null);
    setError('');

    const dimensions = [
      length && `length: ${length}`,
      width && `width: ${width}`,
    ].filter(Boolean).join(', ');

    const prompt = `You are an expert knitting pattern designer. Create a complete, detailed knitting pattern based on these specifications:

Object: ${objectName}
Style: ${style}
Yarn weight: ${yarnWeight}
Difficulty: ${difficulty}${dimensions ? `\nDimensions: ${dimensions}` : ''}${extraNotes ? `\nAdditional notes: ${extraNotes}` : ''}

Return a JSON object with this exact structure:
{
  "name": "Pattern name",
  "tagline": "One-line description (yarn weight · dimensions · style summary)",
  "metadata": {
    "Yarn weight": "...",
    "Needle size": "...",
    "Gauge": "...",
    "Cast on": "...",
    "Finished length": "...",
    "Finished width": "...",
    "Yarn needed": "...",
    "Difficulty": "..."
  },
  "abbreviations": {
    "k": "knit",
    "p": "purl"
    // include all abbreviations used in the pattern
  },
  "extras": [
    // Optional — include only if relevant (e.g. cable definitions, special techniques)
    {
      "title": "Cable Definitions",
      "rows": [
        ["C4F", "Sl 2 sts to cn, hold in front. K2 from left needle. K2 from cn."],
        ["C4B", "Sl 2 sts to cn, hold in back. K2 from left needle. K2 from cn."]
      ]
    }
  ],
  "stitchPattern": {
    // Optional — include for textured/cable/colorwork patterns
    "title": "Stitch Pattern — N stitch repeat layout",
    "layout": "K2 · P2 · [C4F or C4B] · P2 · K2",
    "note": "Brief explanation of the stitch structure"
  },
  "sections": [
    {
      "title": "Pattern Instructions",
      "content": "Numbered step-by-step instructions as a single string, with each step on a new line starting with the step number and period. E.g.:\\n1. Cast on: ...\\n2. Setup row: ...\\n3. Row 1 — RS: ..."
    },
    {
      "title": "4-Row Repeat At a Glance",
      "content": "Quick reference table as text"
    },
    {
      "title": "Finishing",
      "content": "Finishing instructions"
    }
  ]
}

Make the pattern genuinely usable — real stitch counts, real gauge, real instructions. Include helpful notes within steps. Return ONLY raw JSON, no markdown, no code fences.`;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'x-loophole-token': token,
          },
          body: JSON.stringify({
            max_tokens: 8096, // triggers Sonnet in the proxy
            messages: [{ role: 'user', content: prompt }],
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      let text = data.content?.[0]?.text ?? '{}';
      text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
      const parsed = JSON.parse(text) as GeneratedPattern;
      setPattern(parsed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate pattern. Please try again.');
    }
    setGenerating(false);
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>Pattern Generator</h1>
      <p style={{ color: '#9CA3AF', marginBottom: 24, fontSize: 14 }}>
        Describe what you want to knit and Claude will generate a complete pattern for you.
      </p>

      {/* Input form */}
      <div style={{ background: '#1F2937', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={lbl}>What do you want to knit?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {OBJECTS.map(o => (
                <button key={o} onClick={() => setObject(o)} style={{
                  padding: '5px 12px', borderRadius: 16, border: '1px solid',
                  borderColor: object === o ? '#7C3AED' : '#374151',
                  background: object === o ? '#7C3AED' : 'transparent',
                  color: object === o ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                }}>{o}</button>
              ))}
            </div>
            {object === 'Other' && (
              <input style={inp} value={customObject} onChange={e => setCustomObject(e.target.value)}
                placeholder="e.g. Baby booties, fingerless gloves…" />
            )}
          </div>

          <div>
            <label style={lbl}>Style</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STYLES.map(s => (
                <button key={s} onClick={() => setStyle(s)} style={{
                  padding: '5px 12px', borderRadius: 16, border: '1px solid',
                  borderColor: style === s ? '#7C3AED' : '#374151',
                  background: style === s ? '#7C3AED' : 'transparent',
                  color: style === s ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                }}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Yarn Weight</label>
            <select value={yarnWeight} onChange={e => setYarnWeight(e.target.value)} style={sel}>
              {YARN_WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Difficulty</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={sel}>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Length</label>
              <input style={inp} value={length} onChange={e => setLength(e.target.value)} placeholder='e.g. 70"' />
            </div>
            <div>
              <label style={lbl}>Width</label>
              <input style={inp} value={width} onChange={e => setWidth(e.target.value)} placeholder='e.g. 6"' />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Additional notes (optional)</label>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
            value={extraNotes} onChange={e => setExtraNotes(e.target.value)}
            placeholder="e.g. Include a simple border, make it suitable for a beginner, use a 4-stitch cable repeat…" />
        </div>

        <button onClick={generate} disabled={generating}
          className="btn btn-primary"
          style={{ opacity: generating ? 0.6 : 1 }}>
          {generating ? '✨ Generating pattern…' : '✨ Generate Pattern'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#1a1020', border: '1px solid #EF4444', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <p style={{ color: '#EF4444', fontSize: 14 }}>{error}</p>
        </div>
      )}

      {generating && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>✨ Crafting your pattern…</p>
          <p style={{ fontSize: 13 }}>This usually takes 10–20 seconds</p>
        </div>
      )}

      {/* Generated pattern output */}
      {pattern && (
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#F9FAFB', marginBottom: 4 }}>{pattern.name}</h2>
          {pattern.tagline && <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 20 }}>{pattern.tagline}</p>}

          {/* Metadata grid */}
          {pattern.metadata && Object.keys(pattern.metadata).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 20 }}>
              {Object.entries(pattern.metadata).map(([k, v]) => v ? (
                <div key={k} style={{ background: '#1F2937', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 500, marginBottom: 3 }}>{k}</p>
                  <p style={{ color: '#F9FAFB', fontSize: 15, fontWeight: 700 }}>{v}</p>
                </div>
              ) : null)}
            </div>
          )}

          {/* Abbreviations */}
          {pattern.abbreviations && Object.keys(pattern.abbreviations).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Abbreviations</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {Object.entries(pattern.abbreviations).map(([abbrev, explanation]) => (
                  <div key={abbrev} style={{ background: '#1F2937', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#7C3AED', fontWeight: 700, fontSize: 13, fontFamily: 'monospace', minWidth: 40 }}>{abbrev}</span>
                    <span style={{ color: '#D1D5DB', fontSize: 13 }}>— {explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extras (cable definitions etc.) */}
          {pattern.extras && pattern.extras.map((extra, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{extra.title}</p>
              <div style={{ background: '#1F2937', borderRadius: 10, overflow: 'hidden' }}>
                {extra.rows.map(([term, def], j) => (
                  <div key={j} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 16, padding: '12px 16px', borderTop: j > 0 ? '1px solid #374151' : 'none' }}>
                    <span style={{ color: '#A78BFA', fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{term}</span>
                    <span style={{ color: '#D1D5DB', fontSize: 14 }}>{def}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Stitch pattern layout */}
          {pattern.stitchPattern && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{pattern.stitchPattern.title}</p>
              <div style={{ background: '#1F2937', borderRadius: 10, padding: 16, marginBottom: 10 }}>
                <p style={{ fontFamily: 'monospace', color: '#D1D5DB', fontSize: 14, lineHeight: 1.8, wordBreak: 'break-word' }}>
                  {pattern.stitchPattern.layout.split('·').map((part, i, arr) => (
                    <span key={i}>
                      {part.trim().startsWith('[') ? (
                        <span style={{ color: '#7C3AED', fontWeight: 700 }}>{part.trim()}</span>
                      ) : part.trim().match(/^[A-Z][0-9]/) ? (
                        <span style={{ color: '#F9FAFB', fontWeight: 700 }}>{part.trim()}</span>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>{part.trim()}</span>
                      )}
                      {i < arr.length - 1 && <span style={{ color: '#374151' }}> · </span>}
                    </span>
                  ))}
                </p>
              </div>
              {pattern.stitchPattern.note && (
                <div style={{ background: '#1a2540', borderRadius: 8, padding: '12px 16px', borderLeft: '3px solid #7C3AED' }}>
                  <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6 }}>{pattern.stitchPattern.note}</p>
                </div>
              )}
            </div>
          )}

          {/* Pattern sections */}
          {pattern.sections && pattern.sections.map((sec, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{sec.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sec.content.split('\n').filter(Boolean).map((line, j) => {
                  const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
                  if (stepMatch) {
                    return (
                      <div key={j} style={{ display: 'flex', gap: 12, background: '#1F2937', borderRadius: 8, padding: '12px 14px' }}>
                        <span style={{
                          background: '#7C3AED', color: '#fff', borderRadius: '50%',
                          width: 24, height: 24, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>{stepMatch[1]}</span>
                        <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6, margin: 0 }}
                          dangerouslySetInnerHTML={{ __html: stepMatch[2].replace(/\*\*(.+?)\*\*/g, '<strong style="color:#F9FAFB">$1</strong>') }}
                        />
                      </div>
                    );
                  }
                  return (
                    <p key={j} style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6, padding: '4px 14px' }}>
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Save to patterns button */}
          <div style={{ borderTop: '1px solid #374151', paddingTop: 20, marginTop: 8 }}>
            <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 12 }}>
              Happy with this pattern? You can save it to your pattern library.
            </p>
            <button
              className="btn btn-primary"
              onClick={async () => {
                const token = sessionStorage.getItem('loophole_token');
                if (!token) return;
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
                await sb.from('patterns').insert({
                  name: pattern.name,
                  source: 'generated',
                  notes: pattern.tagline ?? null,
                  parsed_guide: {
                    sections: pattern.sections.map(s => ({
                      title: s.title,
                      steps: s.content.split('\n').filter(Boolean),
                    })),
                  },
                });
                alert(`"${pattern.name}" saved to your patterns!`);
              }}
            >
              💾 Save to Patterns
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', color: '#9CA3AF', fontSize: 12, fontWeight: 500, marginBottom: 8 };
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
