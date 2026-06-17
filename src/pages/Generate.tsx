import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { inputStyle, selectStyle, labelStyle, difficultyColor } from '../lib/theme';

const YARN_WEIGHTS = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];
const DIFFICULTIES = ['Beginner', 'Easy', 'Intermediate', 'Advanced'];

const SUGGESTED_OBJECTS = ['Scarf', 'Hat', 'Cowl', 'Shawl', 'Mittens', 'Socks', 'Sweater', 'Cardigan', 'Baby Blanket', 'Dishcloth', 'Fingerless Gloves', 'Headband', 'Bag', 'Toy'];
const SUGGESTED_STYLES = ['Stockinette', 'Garter', 'Ribbing', 'Seed stitch', 'Moss stitch', 'Ribbing with cabling', 'Lace', 'Colorwork', 'Cables', 'Textured', 'Brioche', 'Slip stitch', 'Fair Isle'];

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
  const [object, setObject] = useState('');
  const [style, setStyle] = useState('');
  const [yarnWeight, setYarnWeight] = useState('Worsted');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [error, setError] = useState('');
  const [activeOutputSection, setActiveOutputSection] = useState(0);

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 500 }}>
        <h1>Pattern Generator</h1>
        <div style={{ background: 'var(--bg-accent)', borderRadius: 12, padding: 20, borderLeft: '3px solid var(--border-medium)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            🔒 This feature requires full access. <a href="/settings" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Unlock</a> to use the pattern generator.
          </p>
        </div>
      </div>
    );
  }

  async function generate() {
    const token = localStorage.getItem('loophole_token');
    if (!token) {
      setError('Session expired. Please go to Settings and unlock again.');
      return;
    }

    const objectName = object.trim();
    if (!objectName) { setError('Please specify what you want to knit.'); return; }

    setGenerating(true);
    setPattern(null);
    setError('');
    setActiveOutputSection(0);

    const dimensions = [
      length && `length: ${length}`,
      width && `width: ${width}`,
    ].filter(Boolean).join(', ');

    const prompt = `You are an expert knitting pattern designer. Create a complete, detailed, genuinely usable knitting pattern based on these specifications:

Object: ${objectName}
Style: ${style || 'your choice based on the object'}
Yarn weight: ${yarnWeight}
Difficulty: ${difficulty}${dimensions ? `\nDimensions: ${dimensions}` : ''}${extraNotes ? `\nAdditional notes: ${extraNotes}` : ''}

Return a JSON object with this exact structure (omit optional fields if not relevant):
{
  "name": "Pattern name",
  "tagline": "One-line description (yarn weight · dimensions · style summary)",
  "metadata": {
    "Yarn weight": "e.g. Medium (4)",
    "Needle size": "e.g. US 7 (4.5 mm)",
    "Gauge": "e.g. 20 sts / 4 inches",
    "Cast on": "e.g. 34 sts",
    "Finished length": "e.g. 70 inches",
    "Finished width": "e.g. 6 inches",
    "Yarn needed": "e.g. ~600 yds",
    "Difficulty": "e.g. Intermediate"
  },
  "abbreviations": {
    "k": "knit",
    "p": "purl"
  },
  "extras": [
    {
      "title": "Cable Definitions",
      "rows": [
        ["C4F", "Sl 2 sts to cn, hold in front. K2 from left needle. K2 from cn."],
        ["C4B", "Sl 2 sts to cn, hold in back. K2 from left needle. K2 from cn."]
      ]
    }
  ],
  "stitchPattern": {
    "title": "Stitch Pattern — N stitch repeat layout",
    "layout": "K2 · P2 · [C4F or C4B] · P2 · K2",
    "note": "Brief explanation of the stitch structure"
  },
  "sections": [
    {
      "title": "Pattern Instructions",
      "content": "Numbered step-by-step instructions as a single string, each step on a new line starting with number and period.\n1. Cast on: ...\n2. Setup row: ...\n3. Row 1 — RS: ..."
    }
  ]
}

Rules:
- Make stitch counts, gauge, and yarn amounts genuinely accurate for the specified yarn weight and dimensions
- For yarn needed: calculate a realistic estimate based on the object type, finished dimensions, and yarn weight. Use these approximate yardage references as a baseline and adjust for dimensions:
  * Scarf (6x60in, worsted): ~400 yds | Hat (adult, worsted): ~200 yds | Mittens (pair, worsted): ~200 yds
  * Socks (pair, fingering): ~400 yds | Cowl (worsted): ~250 yds | Shawl (DK): ~800 yds
  * Baby blanket (worsted): ~800 yds | Sweater (adult M, worsted): ~1200 yds
  * Lighter yarn weights need more yards for the same area; heavier weights need fewer
  * Always err on the side of slightly more rather than less, and note it as approximate
- Include helpful coaching notes within steps (e.g. why to do something, what to watch out for)
- Only include extras and stitchPattern if they are relevant to this specific pattern
- Only include a row repeat reference section in sections[] if the pattern has a repeating row structure
- All abbreviations used in the instructions must be defined in the abbreviations object
- Return ONLY raw JSON, no markdown, no code fences, no comments`;

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
      if (!res.ok) {
        const errMsg = data.error ?? `Error ${res.status}`;
        if (res.status === 401) throw new Error('Session expired — please go to Settings and unlock again.');
        throw new Error(errMsg);
      }

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
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Describe what you want to knit and Claude will generate a complete pattern for you.
      </p>

      {/* Input form */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={lbl}>What do you want to knit?</label>
            <input style={{ ...inp, marginBottom: 8 }} value={object} onChange={e => setObject(e.target.value)}
              placeholder="e.g. Scarf, Baby booties, Fingerless gloves…" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SUGGESTED_OBJECTS.map(o => (
                <button key={o} onClick={() => setObject(o)} style={{
                  padding: '3px 10px', borderRadius: 16, border: '1px solid var(--border-medium)',
                  background: object === o ? 'var(--primary)' : 'transparent',
                  color: object === o ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
                }}>{o}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={lbl}>Style</label>
            <input style={{ ...inp, marginBottom: 8 }} value={style} onChange={e => setStyle(e.target.value)}
              placeholder="e.g. Cables, Lace, Fair Isle, leave blank for Claude to decide…" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SUGGESTED_STYLES.map(s => (
                <button key={s} onClick={() => setStyle(s)} style={{
                  padding: '3px 10px', borderRadius: 16, border: '1px solid var(--border-medium)',
                  background: style === s ? 'var(--primary)' : 'transparent',
                  color: style === s ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
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
        <div style={{ background: 'var(--danger-vivid-bg)', border: '1px solid var(--danger-vivid)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <p style={{ color: 'var(--danger-vivid)', fontSize: 14 }}>
            {error}
            {error.includes('expired') && (
              <> <a href="/settings" style={{ color: 'var(--text-accent)', textDecoration: 'underline' }}>Go to Settings →</a></>
            )}
          </p>
        </div>
      )}

      {generating && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>✨ Crafting your pattern…</p>
          <p style={{ fontSize: 13 }}>This usually takes 10–20 seconds</p>
        </div>
      )}

      {/* Generated pattern output */}
      {pattern && (
        <div>
          <div className="reveal">
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{pattern.name}</h2>
            {pattern.tagline && <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>{pattern.tagline}</p>}
          </div>

          {/* Metadata grid */}
          {pattern.metadata && Object.keys(pattern.metadata).length > 0 && (
            <div className="reveal" style={{ animationDelay: '0.05s', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 20 }}>
              {Object.entries(pattern.metadata).map(([k, v]) => v ? (
                <div key={k} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, marginBottom: 3 }}>{k}</p>
                  <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700 }}>{v}</p>
                </div>
              ) : null)}
            </div>
          )}

          {/* Sticky section nav — only worth showing once there's more than one section to jump between */}
          {pattern.sections && pattern.sections.length > 1 && (
            <div className="section-nav-sticky reveal" style={{ animationDelay: '0.08s' }}>
              {pattern.sections.map((sec, i) => (
                <button
                  key={i}
                  className={`section-nav-pill ${activeOutputSection === i ? 'active' : ''}`}
                  onClick={() => {
                    setActiveOutputSection(i);
                    document.getElementById(`gen-section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {sec.title}
                </button>
              ))}
            </div>
          )}

          {/* Abbreviations */}
          {pattern.abbreviations && Object.keys(pattern.abbreviations).length > 0 && (
            <div className="reveal" style={{ animationDelay: '0.1s', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Abbreviations</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {Object.entries(pattern.abbreviations).map(([abbrev, explanation]) => (
                  <div key={abbrev} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 13, fontFamily: 'monospace', minWidth: 40 }}>{abbrev}</span>
                    <span style={{ color: 'var(--text-body)', fontSize: 13 }}>— {explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extras (cable definitions etc.) */}
          {pattern.extras && pattern.extras.map((extra, i) => (
            <div key={i} className="reveal" style={{ animationDelay: `${0.12 + i * 0.04}s`, marginBottom: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{extra.title}</p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
                {extra.rows.map(([term, def], j) => (
                  <div key={j} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 16, padding: '12px 16px', borderTop: j > 0 ? '1px solid var(--border-light)' : 'none' }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{term}</span>
                    <span style={{ color: 'var(--text-body)', fontSize: 14 }}>{def}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Stitch pattern layout */}
          {pattern.stitchPattern && (
            <div className="reveal" style={{ animationDelay: '0.16s', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{pattern.stitchPattern.title}</p>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 16, marginBottom: 10 }}>
                <p style={{ fontFamily: 'monospace', color: 'var(--text-body)', fontSize: 14, lineHeight: 1.8, wordBreak: 'break-word' }}>
                  {pattern.stitchPattern.layout.split('·').map((part, i, arr) => (
                    <span key={i}>
                      {part.trim().startsWith('[') ? (
                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{part.trim()}</span>
                      ) : part.trim().match(/^[A-Z][0-9]/) ? (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{part.trim()}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{part.trim()}</span>
                      )}
                      {i < arr.length - 1 && <span style={{ color: 'var(--border-medium)' }}> · </span>}
                    </span>
                  ))}
                </p>
              </div>
              {pattern.stitchPattern.note && (
                <div style={{ background: 'var(--bg-accent)', borderRadius: 8, padding: '12px 16px', borderLeft: '3px solid var(--border-accent)' }}>
                  <p style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6 }}>{pattern.stitchPattern.note}</p>
                </div>
              )}
            </div>
          )}

          {/* Pattern sections */}
          {pattern.sections && pattern.sections.map((sec, i) => (
            <div key={i} id={`gen-section-${i}`} className="reveal" style={{ animationDelay: `${0.2 + i * 0.05}s`, marginBottom: 24, scrollMarginTop: 60 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{sec.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sec.content.split('\n').filter(Boolean).map((line, j) => {
                  const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
                  if (stepMatch) {
                    return (
                      <div key={j} className="step-card reveal" style={{
                        animationDelay: `${0.22 + i * 0.05 + j * 0.025}s`,
                        display: 'flex', gap: 12, background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        borderLeft: `3px solid ${difficultyColor(pattern.metadata?.['Difficulty'])}`,
                        borderRadius: 8, padding: '12px 14px',
                      }}>
                        <span style={{ background: 'var(--primary)', color: 'var(--primary-text)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{stepMatch[1]}</span>
                        <p style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6, margin: 0 }}
                          dangerouslySetInnerHTML={{ __html: stepMatch[2].replace(/\*\*(.+?)\*\*/g, `<strong style="color:var(--text-primary)">$1</strong>`) }}
                        />
                      </div>
                    );
                  }
                  return (
                    <p key={j} style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6, padding: '4px 14px' }}>{line}</p>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Save to patterns button */}
          <div className="reveal" style={{ animationDelay: '0.1s', borderTop: '1px solid var(--border-light)', paddingTop: 20, marginTop: 8 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              Happy with this pattern? You can save it to your pattern library.
            </p>
            <button
              className="btn btn-primary"
              onClick={async () => {
                const { error } = await supabase.from('patterns').insert({
                  name: pattern.name,
                  source: 'generated',
                  difficulty: pattern.metadata?.['Difficulty'] ?? null,
                  yarn_weight: pattern.metadata?.['Yarn weight'] ?? null,
                  needle_size: pattern.metadata?.['Needle size'] ?? null,
                  notes: pattern.tagline ?? null,
                  gauge_stitches: (() => {
                    const g = pattern.metadata?.['Gauge'] ?? '';
                    const m = g.match(/(\d+(?:\.\d+)?)\s*sts/);
                    return m ? parseFloat(m[1]) : null;
                  })(),
                  gauge_rows: (() => {
                    const g = pattern.metadata?.['Gauge'] ?? '';
                    const m = g.match(/(\d+(?:\.\d+)?)\s*rows/);
                    return m ? parseFloat(m[1]) : null;
                  })(),
                  gauge_unit: (() => {
                    const g = pattern.metadata?.['Gauge'] ?? '';
                    if (g.includes('10cm') || g.includes('10 cm')) return 'per 10cm';
                    if (g.includes('4in') || g.includes('4 in') || g.includes('4"')) return 'per 4in';
                    return 'per 4in';
                  })(),
                  parsed_guide: {
                    generated: true,
                    metadata: pattern.metadata,
                    abbreviations: pattern.abbreviations,
                    extras: pattern.extras ?? [],
                    stitchPattern: pattern.stitchPattern ?? null,
                    sections: pattern.sections.map(s => ({
                      title: s.title,
                      steps: s.content.split('\n').filter(Boolean),
                    })),
                  },
                });
                if (error) {
                  alert(`Failed to save: ${error.message}`);
                } else {
                  alert(`“${pattern.name}” saved to your patterns!`);
                }
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

const lbl = labelStyle;
const inp = inputStyle;
const sel = selectStyle;
