import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { inputStyle, selectStyle, labelStyle, difficultyColor, stepDifficulty } from '../lib/theme';

const YARN_WEIGHTS = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];
const DIFFICULTIES = ['Beginner', 'Easy', 'Intermediate', 'Advanced'];

const OBJECT_CARDS = [
  { label: 'Hat',            emoji: '🧢' },
  { label: 'Scarf',          emoji: '🧣' },
  { label: 'Mittens',        emoji: '🧤' },
  { label: 'Socks',          emoji: '🧦' },
  { label: 'Cowl',           emoji: '👜' },
  { label: 'Sweater',        emoji: '🦺' },
  { label: 'Shawl',          emoji: '🧶' },
  { label: 'Bag',            emoji: '👜' },
  { label: 'Fingerless',     emoji: '🧤' },
  { label: 'Baby Blanket',   emoji: '👶' },
  { label: 'Toy',            emoji: '🧸' },
  { label: 'Dishcloth',      emoji: '🧹' },
  { label: 'Headband',       emoji: '🎠' },
  { label: 'Cardigan',       emoji: '🧥' },
  { label: 'Custom…',       emoji: '✏️' },
];

const STYLE_CARDS = [
  { label: 'Cables',       desc: 'Crossed stitches, textured ropes' },
  { label: 'Lace',         desc: 'Open eyelets, delicate patterns' },
  { label: 'Brioche',      desc: 'Squishy, reversible rib texture' },
  { label: 'Fair Isle',    desc: 'Stranded colourwork, geometric motifs' },
  { label: 'Colorwork',    desc: 'Two or more colours, intarsia or stranded' },
  { label: 'Garter',       desc: 'Knit every row, ridged texture' },
  { label: 'Ribbing',      desc: 'Stretchy knit-purl columns' },
  { label: 'Seed stitch',  desc: 'Alternating k/p, bumpy texture' },
  { label: 'Textured',     desc: 'Mixed stitches, dimensional surface' },
  { label: 'Slip stitch',  desc: 'Mosaic patterns, easy colourwork' },
  { label: 'Stockinette',  desc: 'Classic smooth fabric, let the yarn shine' },
  { label: 'Custom…',     desc: 'Describe exactly what you want' },
];

// For the randomiser — label values that map to generator inputs
const SUGGESTED_OBJECTS = OBJECT_CARDS.filter(o => o.label !== 'Custom…').map(o => o.label);
const SUGGESTED_STYLES  = STYLE_CARDS.filter(s => s.label  !== 'Custom…').map(s => s.label);

// Objects where the third dimension field should be labelled 'Circumference'
const CIRCULAR_OBJECTS = ['Hat', 'Cowl', 'Mittens', 'Socks', 'Headband', 'Fingerless'];

type PatternSection = {
  title: string;
  content: string;
};

type GeneratedPattern = {
  name: string;
  tagline: string;
  metadata: Record<string, string>;
  sizes?: string[];
  materials?: { yarn: string; needles: string; notions?: string[] };
  prerequisites?: string[];
  abbreviations: Record<string, string>;
  extras?: { title: string; rows: [string, string][] }[];
  stitchPattern?: { title: string; layout: string; note: string };
  sections: PatternSection[];
  stepDifficulty?: Record<string, string>;
  visualization?: string;
};

type HistoryEntry = {
  id: string;
  name: string;
  tagline: string;
  inputs: { object: string; style: string; yarnWeight: string; difficulty: string; length: string; width: string; circumference: string; extraNotes: string };
  pattern: GeneratedPattern;
  savedAt: string;
};

type PromptTemplate = {
  id: string;
  name: string;
  object: string;
  style: string;
  yarnWeight: string;
  difficulty: string;
  length: string;
  width: string;
  circumference: string;
  extraNotes: string;
  savedAt: string;
};

const HISTORY_KEY = 'loophole_gen_history';
const TEMPLATES_KEY = 'loophole_gen_templates';

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveToHistory(entry: HistoryEntry) {
  const history = loadHistory();
  const updated = [entry, ...history.filter(h => h.id !== entry.id)].slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}
function loadTemplates(): PromptTemplate[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]'); } catch { return []; }
}
function saveTemplate(t: PromptTemplate) {
  const templates = loadTemplates();
  const updated = [t, ...templates.filter(x => x.id !== t.id)].slice(0, 20);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
}
function deleteTemplate(id: string) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(loadTemplates().filter(t => t.id !== id)));
}

export default function GeneratePage() {
  const { unlocked } = useAuth();
  const [object, setObject] = useState('');
  const [customObjectActive, setCustomObjectActive] = useState(false);
  const [style, setStyle] = useState('');
  const [customStyleActive, setCustomStyleActive] = useState(false);
  const [yarnWeight, setYarnWeight] = useState('Worsted');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [circumference, setCircumference] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [useStash, setUseStash] = useState(false);
  const [stashWeights, setStashWeights] = useState<string[]>([]);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingViz, setGeneratingViz] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<number | null>(null);
  const [diagType, setDiagType] = useState<'auto' | 'schematic' | 'stitch' | 'colorwork'>('auto');
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [error, setError] = useState('');
  const [activeOutputSection, setActiveOutputSection] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => loadTemplates());
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  // Inline save state — replaces the alert() dialog with a button state change
  const [saved, setSaved] = useState(false);
  const [saveCategory, setSaveCategory] = useState('');
  // Track which section tabs have been visited so we can show a subtle ✓ indicator
  const [visitedSections, setVisitedSections] = useState<Set<number>>(new Set([0]));
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  // Fetch in-stock yarn weights for the "Use my stash" toggle
  useEffect(() => {
    supabase
      .from('yarn_stash')
      .select('yarn_catalog:yarn_catalog_id(weight)')
      .eq('status', 'in_stock')
      .then(({ data }) => {
        const weights = (data ?? [])
          .map((r: unknown) => (r as { yarn_catalog: { weight?: string } | null }).yarn_catalog?.weight)
          .filter((w): w is string => !!w);
        // Deduplicate and sort by canonical weight order
        const unique = YARN_WEIGHTS.filter(w => weights.some(sw =>
          sw.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(sw.toLowerCase())
        ));
        setStashWeights(unique);
      });
  }, []);

  function handleReferenceImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setReferenceImage(file);
    if (referenceImagePreview) URL.revokeObjectURL(referenceImagePreview);
    setReferenceImagePreview(URL.createObjectURL(file));
  }

  function clearReferenceImage() {
    if (referenceImagePreview) URL.revokeObjectURL(referenceImagePreview);
    setReferenceImage(null);
    setReferenceImagePreview(null);
  }

  function imageFileToBase64(file: File, maxDim = 1024): Promise<{ base64: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
      img.src = url;
    });
  }

  const isCircularObject = CIRCULAR_OBJECTS.some(o => object.toLowerCase().includes(o.toLowerCase()));

  function randomise() {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    setObject(pick(SUGGESTED_OBJECTS));
    setStyle(pick(SUGGESTED_STYLES));
    setYarnWeight(pick(YARN_WEIGHTS));
    setDifficulty(pick(DIFFICULTIES));
    setLength('');
    setWidth('');
    setCircumference('');
    // Fetch a random quirk from the database
    supabase
      .from('pattern_quirks')
      .select('quirk')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const quirk = data[Math.floor(Math.random() * data.length)].quirk;
          setExtraNotes(`Constraint: ${quirk}`);
        } else {
          setExtraNotes('');
        }
      });
  }

  async function generate() {
    const token = localStorage.getItem('loophole_token');
    if (!token) { setError('Session expired. Please go to Settings and unlock again.'); return; }
    const objectName = object.trim();
    if (!objectName) { setError('Please specify what you want to knit.'); return; }

    setGenerating(true);
    setPattern(null);
    setError('');
    setActiveOutputSection(0);
    setSaved(false);
    setSaveCategory('');
    setVisitedSections(new Set([0]));

    const dimensions = [
      length && `length: ${length}`,
      width && `width: ${width}`,
      circumference && `circumference: ${circumference}`,
    ].filter(Boolean).join(', ');

    const prompt = `You are an expert knitting pattern designer. Create a complete, detailed, genuinely usable knitting pattern based on these specifications:

Object: ${objectName}
Style: ${style || 'your choice based on the object'}
Yarn weight: ${yarnWeight}
Difficulty: ${difficulty}${dimensions ? `\nDimensions: ${dimensions}` : ''}${extraNotes ? `\nAdditional notes: ${extraNotes}` : ''}${referenceImage ? `\n\nA reference image is attached. Use it as visual inspiration alongside the specifications above — let it inform the silhouette, stitch texture, colorwork, proportions, and overall aesthetic you design toward. The text specifications (object, style, yarn weight, difficulty, dimensions) still take priority where they conflict with what the image shows; use the image to fill in and refine the details those specifications leave open, not to override them.` : ''}

Return a JSON object with this exact structure (omit optional fields if not relevant):
{
  "name": "Pattern name",
  "tagline": "One-line description (yarn weight · dimensions · style summary)",
  "sizes": ["One Size"],
  "metadata": {
    "Yarn weight": "e.g. Medium (4)",
    "Needle size": "e.g. US 7 (4.5 mm)",
    "Gauge": "e.g. 20 sts / 4 inches",
    "Cast on": "e.g. 34 sts",
    "Finished length": "e.g. 70 inches",
    "Finished width": "e.g. 6 inches",
    "Difficulty": "e.g. Intermediate"
  },
  "materials": {
    "yarn": "e.g. ~600 yds worsted weight yarn (shown in Cascade 220)",
    "needles": "e.g. US 7 (4.5mm) straight or circular needles, 32 inches",
    "notions": ["Tapestry needle", "Stitch markers", "Scissors"]
  },
  "prerequisites": [
    "Long-tail cast on",
    "Knit and purl stitches",
    "Binding off"
  ],
  "abbreviations": {
    "k": "knit",
    "p": "purl"
  },
  "stepDifficulty": {
    "Pattern Instructions|1": "Easy",
    "Pattern Instructions|6": "Advanced"
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
      "title": "Gauge Swatch",
      "content": "1. Cast on 24 sts using your chosen yarn and needle size...\n2. Work in pattern for 4 inches..."
    },
    {
      "title": "Cast On & Brim",
      "content": "1. Using the long-tail cast on, cast on X sts...\n2. Join to work in the round..."
    },
    {
      "title": "Body",
      "content": "1. Begin main pattern..."
    },
    {
      "title": "Finishing",
      "content": "1. Break yarn and draw through remaining sts..."
    }
  ]
}

Rules:
- STITCH COUNT MATH: Verify all stitch counts are mathematically consistent before returning. The cast-on stitch count must be evenly divisible by any stitch pattern repeat. If you specify a 6-stitch cable repeat, the cast-on must be a multiple of 6 (plus any edge stitches). Double-check every increase, decrease, and shaping calculation against the running stitch count
- GAUGE CONSISTENCY: The needle size, yarn weight, and gauge must be consistent with each other. A worsted weight yarn on 4.5mm needles should give approximately 18–22 sts per 4 inches in stockinette. Do not specify a gauge that contradicts the needle size or yarn weight
- YARN QUANTITY: For objects with distinct components (sweater body + sleeves, socks with heel + leg + foot), break the yarn estimate down by section in the materials.yarn field. For simple objects, a single total is fine. Always note it as approximate and round up generously
- sizes: include if the pattern supports multiple sizes (e.g. ["XS", "S", "M", "L", "XL"] or ["Child", "Adult"]). Use ["One Size"] for patterns with no sizing
- materials: always include. yarn should specify total yardage, weight, and a suggested yarn. needles should include size in both US and mm. notions lists any additional tools needed (stitch markers, tapestry needle, cable needle, stitch holders, etc.)
- prerequisites: list every technique the knitter must already know before starting. Be specific — not just "knitting" but "long-tail cast on", "k2tog decrease", "picking up stitches", etc. Derive this list from the actual techniques used in the instructions
- NEVER USE SHORTHAND REPETITION: Never write "Continue in pattern as established", "Repeat last row", "Work as before", "Continue as set", "Repeat from * to *", "Work even in pattern", or any similar shorthand that refers back to a previous step. Every single step must be written out in full with explicit stitch-by-stitch instructions. If a row or round repeats identically 10 times, write it out 10 times as 10 separate numbered steps. The knitter should never need to refer back to a previous step to understand what to do next
- Include helpful coaching notes within steps (e.g. why to do something, what to watch out for)
- SECTIONS: Split instructions into logical named sections — never put everything into one "Pattern Instructions" section. Each distinct construction phase gets its own section: e.g. "Gauge Swatch", "Cast On", "Brim", "Body", "Shaping", "Crown", "Finishing", "Sleeves", "Neckband" — whatever phases apply to this specific object. A hat should have at minimum: Gauge Swatch, Brim, Body, Crown. A sweater should have at minimum: Gauge Swatch, Body, Sleeves, Neckband, Finishing. Simple objects (scarves, dishcloths) may have 2–3 sections. Complex objects should have 4–7. Each step within a section must start with its number and a period on its own line
- Only include extras and stitchPattern if they are relevant to this specific pattern
- Only include a row repeat reference section in sections[] if the pattern has a repeating row structure
- All abbreviations used in the instructions must be defined in the abbreviations object
- stepDifficulty is OPTIONAL and should only be included if the pattern has genuinely varying difficulty across its steps. If the whole pattern is uniformly one difficulty level, omit stepDifficulty entirely
- When included, key stepDifficulty as "<section title>|<step number>" exactly matching the section's title string and the step's number. Only include entries for steps whose difficulty differs from the overall pattern difficulty
- Use the same difficulty labels as the overall scale: "Beginner", "Easy", "Intermediate", "Advanced"
- Return ONLY raw JSON, no markdown, no code fences, no comments
- CRITICAL: All string values in the JSON must be properly escaped. Use \" for any double quote character inside a string (e.g. needle sizes like US 7 (4.5mm) are fine, but if you write 6\" inches you must escape the inch mark as 6\\\" or write it as 6 inches instead). Never use unescaped double quotes, backslashes, or control characters inside JSON string values. For line breaks within content strings, use the two-character sequence \\n — never a literal newline character`;

    try {
      const messageContent: Array<Record<string, unknown>> = [];
      if (referenceImage) {
        const { base64, mediaType } = await imageFileToBase64(referenceImage);
        messageContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
      }
      messageContent.push({ type: 'text', text: prompt });

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
            max_tokens: 16000,
            messages: [{ role: 'user', content: messageContent }],
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error ?? `Error ${res.status}`;
        if (res.status === 401) throw new Error('Session expired — please go to Settings and unlock again.');
        throw new Error(errMsg);
      }

      // Read the SSE stream and accumulate the full text
      const contentType = res.headers.get('content-type') ?? '';
      let text = '';

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                text += evt.delta.text;
              }
            } catch { /* skip malformed lines */ }
          }
        }
      } else {
        // Fallback: non-streaming response
        const data = await res.json();
        if (res.status === 401) throw new Error('Session expired — please go to Settings and unlock again.');
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        text = data.content?.[0]?.text ?? '{}';
      }
      text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
      // Pre-sanitise common issues before parsing
      text = text
        .replace(/(\d)"(\s|,|\.|\\n|\)|:)/g, '$1in$2')  // inch marks: 22" → 22in
        .replace(/(\d)"$/gm, '$1in');                      // inch marks at end of line

      // Attempt parse with increasingly aggressive repair
      let parsed: GeneratedPattern;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Repair pass: fix unescaped control characters inside JSON strings.
        // Strategy: walk the string char by char tracking whether we're inside a JSON
        // string, and escape any bare newlines/tabs/quotes we find there.
        try {
          let repaired = '';
          let inString = false;
          let escaped = false;
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (escaped) {
              repaired += ch;
              escaped = false;
              continue;
            }
            if (ch === '\\') {
              repaired += ch;
              escaped = true;
              continue;
            }
            if (ch === '"') {
              inString = !inString;
              repaired += ch;
              continue;
            }
            if (inString) {
              if (ch === '\n') { repaired += '\\n'; continue; }
              if (ch === '\r') { repaired += '\\r'; continue; }
              if (ch === '\t') { repaired += '\\t'; continue; }
            }
            repaired += ch;
          }
          parsed = JSON.parse(repaired);
        } catch (finalErr) {
          console.error('JSON repair failed. Text length:', text.length);
          console.error('Sample around error:', text.slice(9900, 10100));
          throw new Error(`Pattern generated but could not be parsed. Try generating again. (${finalErr instanceof Error ? finalErr.message : String(finalErr)})`);
        }
      }
      setPattern(parsed);
      // Auto-generate visualization in the background while user reads the pattern
      generateVisualization('auto', parsed, objectName);
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        name: parsed.name,
        tagline: parsed.tagline,
        inputs: { object: objectName, style, yarnWeight, difficulty, length, width, circumference, extraNotes },
        pattern: parsed,
        savedAt: new Date().toISOString(),
      };
      saveToHistory(entry);
      setHistory(loadHistory());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate pattern. Please try again.');
    }
    clearReferenceImage();
    setGenerating(false);
  }

  async function generateVisualization(typeHint: typeof diagType = diagType, patternOverride?: GeneratedPattern, objectOverride?: string) {
    const activePattern = patternOverride ?? pattern;
    const activeObject = objectOverride ?? object;
    if (!activePattern) return;
    const token = localStorage.getItem('loophole_token');
    if (!token) return;

    setGeneratingViz(true);
    if (patternOverride) {
      // Setting on fresh pattern — visualization will be set when ready
    } else {
      setPattern(prev => prev ? { ...prev, visualization: undefined } : prev);
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const colors = isDark
      ? { bg: '#2a1a22', bgAlt: '#321e28', text: '#e8c8d8', accent: '#c47aaa' }
      : { bg: '#ffffff', bgAlt: '#fdf6f0', text: '#5c3d2e', accent: '#c49bbf' };

    const patternSummary = [
      `Name: ${activePattern.name}`,
      `Object: ${activeObject || activePattern.name}`,
      activePattern.metadata?.['Needle size'] && `Needle size: ${activePattern.metadata['Needle size']}`,
      activePattern.metadata?.['Gauge'] && `Gauge: ${activePattern.metadata['Gauge']}`,
      activePattern.metadata?.['Cast on'] && `Cast on: ${activePattern.metadata['Cast on']}`,
      activePattern.metadata?.['Finished length'] && `Finished length: ${activePattern.metadata['Finished length']}`,
      activePattern.metadata?.['Finished width'] && `Finished width: ${activePattern.metadata['Finished width']}`,
      activePattern.metadata?.['Difficulty'] && `Difficulty: ${activePattern.metadata['Difficulty']}`,
      activePattern.stitchPattern && `Stitch pattern: ${activePattern.stitchPattern.layout}`,
      activePattern.extras?.length && `Extras: ${activePattern.extras.map(e => e.title).join(', ')}`,
    ].filter(Boolean).join('\n');

    const typeInstruction = typeHint === 'auto'
      ? `Choose the diagram type that adds the most value for this specific pattern:
- For shaped garments (sweaters, hats, socks, mittens, shawls): a schematic showing the finished shape with labeled measurements
- For cables or textured stitches: a stitch repeat chart showing the row-by-row structure with knit/purl/cable symbols
- For colorwork or Fair Isle: a color grid chart showing the repeat
- For simple rectangular pieces (scarves, dishcloths, blankets): a schematic with shape and dimensions labeled`
      : typeHint === 'schematic'
      ? `Generate a schematic diagram showing the finished shape with all key measurements labeled. Use clean outlines and dimension lines.`
      : typeHint === 'stitch'
      ? `Generate a stitch repeat chart showing the row-by-row structure. Use symbols for knit (empty square), purl (dot), and any cable or special stitches. Include a legend.`
      : `Generate a colorwork grid chart showing the stitch repeat as a color grid. Use filled and empty squares to represent the two (or more) colors. Include a legend.`;

    const vizPrompt = `You are a technical illustrator specialising in knitting pattern diagrams. Based on this pattern summary, generate a single SVG diagram.

Pattern summary:
${patternSummary}

${typeInstruction}

SVG requirements:
- viewBox="0 0 500 380" — always this exact size so it fits the card
- Background: rect fill="${colors.bg}" covering the full viewBox
- Alternate/secondary background areas: fill="${colors.bgAlt}"
- Primary text (labels, titles): fill="${colors.text}"
- Accent text (measurements, highlights): fill="${colors.accent}"
- Grid/symbol lines: stroke="${colors.accent}" opacity 0.4–0.7
- Shape outlines: stroke="${colors.accent}" stroke-width="2" fill="none"
- Filled cells (knit squares, color blocks): fill="${colors.accent}" opacity 0.7
- Purl/background cells: fill="${colors.bgAlt}" stroke="${colors.accent}" stroke-width="0.5" opacity 0.5
- Font: font-family="system-ui, sans-serif"
- Include a small legend if using symbols
- Include a title text element near the top identifying the diagram type
- Keep it clean and readable — prioritise clarity over complexity
- ONE DIAGRAM ONLY: choose a single diagram type and use the full viewBox for it. Do not combine a schematic and a stitch chart in the same SVG — pick whichever adds more value and fill the space with that alone. If in doubt, a well-labelled schematic with generous whitespace is better than two cramped diagrams
- Return ONLY the raw SVG markup starting with <svg and ending with </svg>, nothing else — no markdown, no explanation, no code fences`;

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
            max_tokens: 4097,
            messages: [{ role: 'user', content: vizPrompt }],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      let svg = (data.content?.[0]?.text ?? '').trim();
      svg = svg.replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/, '').trim();
      if (!svg.startsWith('<svg')) throw new Error('Response was not valid SVG');
      setPattern(prev => prev ? { ...prev, visualization: svg } : prev);
    } catch (e) {
      console.error('Visualization generation failed:', e);
      setPattern(prev => prev ? { ...prev, visualization: 'error' } : prev);
    }
    setGeneratingViz(false);
  }

  async function regenerateSection(sectionIndex: number) {
    if (!pattern) return;
    const token = localStorage.getItem('loophole_token');
    if (!token) return;
    const sec = pattern.sections[sectionIndex];
    if (!sec) return;
    setRegeneratingSection(sectionIndex);

    const sectionPrompt = `You are an expert knitting pattern designer. Regenerate ONLY the section titled "${sec.title}" for this pattern.

Pattern context:
- Name: ${pattern.name}
- Object: ${object || pattern.name}
- Style: ${style || 'as in the original pattern'}
- Yarn weight: ${yarnWeight}
- Difficulty: ${difficulty}
- Gauge: ${pattern.metadata?.['Gauge'] ?? 'as specified in pattern'}
- Cast on: ${pattern.metadata?.['Cast on'] ?? 'as specified in pattern'}
- Abbreviations in use: ${Object.keys(pattern.abbreviations ?? {}).join(', ')}

The other sections are: ${pattern.sections.filter((_, i) => i !== sectionIndex).map(s => s.title).join(', ')}

Write a complete, improved version of the "${sec.title}" section. Keep the same overall structure and stitch count logic, but improve clarity, accuracy, or detail.

Return ONLY a JSON object with this exact shape, nothing else — no markdown, no fences:
{ "title": "${sec.title}", "content": "1. Step one...\n2. Step two..." }`;

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
            max_tokens: 4097,
            messages: [{ role: 'user', content: sectionPrompt }],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      let text = (data.content?.[0]?.text ?? '').trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
      const updated = JSON.parse(text) as PatternSection;
      setPattern(prev => {
        if (!prev) return prev;
        const newSections = [...prev.sections];
        newSections[sectionIndex] = updated;
        return { ...prev, sections: newSections };
      });
    } catch (e) {
      console.error('Section regeneration failed:', e);
      alert('Section regeneration failed. The original section has been kept.');
    }
    setRegeneratingSection(null);
  }

  function handleSaveTemplate() {
    if (!saveTemplateName.trim()) return;
    const t: PromptTemplate = {
      id: Date.now().toString(),
      name: saveTemplateName.trim(),
      object, style, yarnWeight, difficulty, length, width, circumference, extraNotes,
      savedAt: new Date().toISOString(),
    };
    saveTemplate(t);
    setTemplates(loadTemplates());
    setSaveTemplateName('');
    setShowSaveTemplate(false);
  }

  function handleLoadTemplate(t: PromptTemplate) {
    setObject(t.object); setStyle(t.style); setYarnWeight(t.yarnWeight);
    setDifficulty(t.difficulty); setLength(t.length); setWidth(t.width);
    setCircumference(t.circumference ?? ''); setExtraNotes(t.extraNotes);
    setShowTemplates(false);
  }

  function handleDeleteTemplate(id: string) {
    deleteTemplate(id);
    setTemplates(loadTemplates());
  }

  async function handleSaveToPatterns() {
    if (!pattern) return;
    const { error: saveError } = await supabase.from('patterns').insert({
      name: pattern.name,
      source: 'generated',
      category: saveCategory || null,
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
        sizes: pattern.sizes ?? ['One Size'],
        materials: pattern.materials ?? null,
        prerequisites: pattern.prerequisites ?? null,
        abbreviations: pattern.abbreviations,
        stepDifficulty: pattern.stepDifficulty ?? null,
        extras: pattern.extras ?? [],
        stitchPattern: pattern.stitchPattern ?? null,
        visualization: (pattern.visualization && pattern.visualization !== 'error') ? pattern.visualization : null,
        sections: pattern.sections.map(s => ({
          title: s.title,
          steps: s.content.split('\n').filter(Boolean),
        })),
      },
    });
    if (saveError) {
      setError('Failed to save: ' + saveError.message);
    } else {
      setSaved(true);
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Pattern Generator</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {templates.length > 0 && (
            <button onClick={() => { setShowTemplates(t => !t); setShowHistory(false); }}
              style={{ background: showTemplates ? 'var(--primary)' : 'var(--bg-card)', border: '1px solid var(--border-medium)', color: showTemplates ? 'var(--primary-text)' : 'var(--text-muted)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
              💾 Templates ({templates.length})
            </button>
          )}
          {history.length > 0 && (
            <button onClick={() => { setShowHistory(h => !h); setShowTemplates(false); }}
              style={{ background: showHistory ? 'var(--primary)' : 'var(--bg-card)', border: '1px solid var(--border-medium)', color: showHistory ? 'var(--primary-text)' : 'var(--text-muted)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
              🕒 History ({history.length})
            </button>
          )}
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
        Describe what you want to knit and Claude will generate a complete pattern for you.
      </p>

      {showHistory && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Recent Generations</p>
          {history.map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-light)', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</p>
                <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>{h.inputs.object} · {h.inputs.yarnWeight} · {new Date(h.savedAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => {
                setPattern(h.pattern); setObject(h.inputs.object); setStyle(h.inputs.style);
                setYarnWeight(h.inputs.yarnWeight); setDifficulty(h.inputs.difficulty);
                setLength(h.inputs.length); setWidth(h.inputs.width);
                setCircumference(h.inputs.circumference ?? ''); setExtraNotes(h.inputs.extraNotes);
                setShowHistory(false); setActiveOutputSection(0); setSaved(false); setVisitedSections(new Set([0]));
              }} style={{ background: 'var(--primary)', border: 'none', color: 'var(--primary-text)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {showTemplates && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Saved Templates</p>
          {templates.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-light)', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{t.name}</p>
                <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>{t.object} · {t.yarnWeight} · {t.difficulty}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => handleLoadTemplate(t)}
                  style={{ background: 'var(--primary)', border: 'none', color: 'var(--primary-text)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Load</button>
                <button onClick={() => handleDeleteTemplate(t.id)}
                  style={{ background: 'none', border: '1px solid var(--danger-vivid)', color: 'var(--danger-vivid)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input form */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>

        {/* Section 1: Object picker */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', marginBottom: 12 }}>What do you want to knit?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {OBJECT_CARDS.map(o => {
              const isCustom = o.label === 'Custom…';
              const isOn = isCustom ? customObjectActive : object === o.label;
              return (
                <button key={o.label} onClick={() => {
                  if (isCustom) {
                    setCustomObjectActive(true);
                    setObject('');
                  } else {
                    setCustomObjectActive(false);
                    setObject(prev => prev === o.label ? '' : o.label);
                  }
                }} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '12px 6px 10px',
                  border: `1px solid ${isOn ? 'var(--primary)' : 'var(--border-medium)'}`,
                  borderRadius: 10,
                  background: isOn ? 'var(--bg-accent)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                  onMouseEnter={e => { if (!isOn) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = 'var(--bg-card-hover)'; } }}
                  onMouseLeave={e => { if (!isOn) { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.background = 'var(--bg-card)'; } }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{o.emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isOn ? 'var(--primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>{o.label}</span>
                </button>
              );
            })}
          </div>
          {/* Custom text input — only shown when Custom… is active */}
          {customObjectActive && (
            <input
              autoFocus
              style={{ ...inp, marginTop: 10 }}
              value={object}
              onChange={e => setObject(e.target.value)}
              placeholder="Describe what you want to knit…"
            />
          )}
        </div>

        {/* Section 2: Style picker */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', marginBottom: 12 }}>Style <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>— leave blank for Claude to decide</span></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {STYLE_CARDS.map(s => {
              const isCustom = s.label === 'Custom…';
              const isOn = isCustom ? customStyleActive : style === s.label;
              return (
                <button key={s.label} onClick={() => {
                  if (isCustom) {
                    setCustomStyleActive(true);
                    setStyle('');
                  } else {
                    setCustomStyleActive(false);
                    setStyle(prev => prev === s.label ? '' : s.label);
                  }
                }} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '10px 12px',
                  border: `1px solid ${isOn ? 'var(--primary)' : 'var(--border-medium)'}`,
                  borderRadius: 10,
                  background: isOn ? 'var(--bg-accent)' : 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                  onMouseEnter={e => { if (!isOn) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = 'var(--bg-card-hover)'; } }}
                  onMouseLeave={e => { if (!isOn) { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.background = 'var(--bg-card)'; } }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: isOn ? 'var(--primary)' : 'var(--text-primary)', marginBottom: 2 }}>{s.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.4 }}>{s.desc}</span>
                </button>
              );
            })}
          </div>
          {/* Custom style input — only shown when Custom… is active */}
          {customStyleActive && (
            <input
              autoFocus
              style={{ ...inp, marginTop: 10 }}
              value={style}
              onChange={e => setStyle(e.target.value)}
              placeholder="Describe the style you want…"
            />
          )}
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Yarn Weight</label>
                {stashWeights.length > 0 && (
                  <button onClick={() => {
                    const next = !useStash;
                    setUseStash(next);
                    if (next && stashWeights.length > 0) setYarnWeight(stashWeights[0]);
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: useStash ? 'var(--bg-accent)' : 'transparent',
                    border: `1px solid ${useStash ? 'var(--primary)' : 'var(--border-medium)'}`,
                    borderRadius: 20, padding: '2px 8px',
                    color: useStash ? 'var(--primary)' : 'var(--text-faint)',
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    🧶 Use my stash
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(useStash && stashWeights.length > 0 ? stashWeights : YARN_WEIGHTS).map(w => (
                  <button key={w} onClick={() => setYarnWeight(w)} style={{
                    padding: '5px 12px', borderRadius: 16, border: '1px solid',
                    borderColor: yarnWeight === w ? 'var(--primary)' : 'var(--border-medium)',
                    background: yarnWeight === w ? 'var(--primary)' : 'transparent',
                    color: yarnWeight === w ? 'var(--primary-text)' : 'var(--text-muted)',
                    fontSize: 12, cursor: 'pointer', fontWeight: 500,
                    transition: 'all 0.12s',
                  }}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 8 }}>Difficulty</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIFFICULTIES.map(d => (
                  <button key={d} onClick={() => setDifficulty(d)} style={{
                    padding: '5px 12px', borderRadius: 16, border: '1px solid',
                    borderColor: difficulty === d ? 'var(--primary)' : 'var(--border-medium)',
                    background: difficulty === d ? 'var(--primary)' : 'transparent',
                    color: difficulty === d ? 'var(--primary-text)' : 'var(--text-muted)',
                    fontSize: 12, cursor: 'pointer', fontWeight: 500,
                    transition: 'all 0.12s',
                  }}>{d}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Dimensions */}
          <div>
            <label style={{ ...lbl, marginBottom: 8 }}>Dimensions <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 10 }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['Length', length, setLength], ['Width', width, setWidth], [isCircularObject ? 'Circumference' : 'Circ / Depth', circumference, setCircumference]].map(([label, val, setter]) => (
                <div key={label as string} style={{ flex: 1 }}>
                  <input style={{ ...inp, textAlign: 'center' }}
                    value={val as string}
                    onChange={e => (setter as (v: string) => void)(e.target.value)}
                    placeholder='e.g. 22"' />
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', marginTop: 3 }}>{label as string}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <label style={lbl}>Additional notes (optional)</label>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
            value={extraNotes} onChange={e => setExtraNotes(e.target.value)}
            placeholder="e.g. Include a simple border, make it suitable for a beginner, use a 4-stitch cable repeat…" />
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <label style={lbl}>Reference image (optional)</label>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleReferenceImageSelect} />
          {referenceImagePreview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={referenceImagePreview} alt="Reference" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-light)' }} />
              <div style={{ flex: 1 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>Claude will use this as visual inspiration alongside your other choices. It's never saved — only used for this one generation.</p>
                <button onClick={clearReferenceImage} style={{ background: 'none', border: '1px solid var(--border-medium)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                  Remove image
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => imageInputRef.current?.click()} style={{
              display: 'block', width: '100%', background: 'var(--bg-input)', border: '1px dashed var(--border-medium)',
              borderRadius: 8, padding: '12px', color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer', textAlign: 'center',
            }}>
              + Add a reference image
            </button>
          )}
        </div>

        <div style={{ padding: '14px 20px', background: 'var(--bg-muted)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={generate} disabled={generating} className="btn btn-primary" style={{ opacity: generating ? 0.6 : 1 }}>
            {generating ? (referenceImage ? '✨ Looking at your reference image…' : '✨ Generating pattern…') : '✨ Generate Pattern'}
          </button>
          <button onClick={() => { randomise(); }} title="Pick random inputs" style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-medium)',
            borderRadius: 8, padding: '10px 14px', fontSize: 16, cursor: 'pointer',
            color: 'var(--text-muted)', transition: 'transform 0.15s, color 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.transform = 'rotate(30deg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'rotate(0deg)'; }}
          >
            🎲
          </button>
          <div style={{ marginLeft: 'auto' }}>
            {showSaveTemplate ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                  placeholder="Template name…"
                  style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-body)', fontSize: 13, minWidth: 160 }} />
                <button onClick={handleSaveTemplate} disabled={!saveTemplateName.trim()}
                  style={{ background: 'var(--primary)', border: 'none', color: 'var(--primary-text)', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', opacity: saveTemplateName.trim() ? 1 : 0.5 }}>Save</button>
                <button onClick={() => { setShowSaveTemplate(false); setSaveTemplateName(''); }}
                  style={{ background: 'none', border: '1px solid var(--border-medium)', color: 'var(--text-muted)', borderRadius: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowSaveTemplate(true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                💾 Save as template
              </button>
            )}
          </div>
        </div>
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

          {/* Sizes */}
          {pattern.sizes && pattern.sizes.length > 0 && pattern.sizes[0] !== 'One Size' && (
            <div className="reveal" style={{ animationDelay: '0.06s', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Sizes</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {pattern.sizes.map(s => (
                  <span key={s} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '4px 12px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Materials */}
          {pattern.materials && (
            <div className="reveal" style={{ animationDelay: '0.07s', background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>You'll Need</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🧶</span>
                  <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Yarn</p>
                    <p style={{ color: 'var(--text-body)', fontSize: 14 }}>{pattern.materials.yarn}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🧵</span>
                  <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Needles</p>
                    <p style={{ color: 'var(--text-body)', fontSize: 14 }}>{pattern.materials.needles}</p>
                  </div>
                </div>
                {pattern.materials.notions && pattern.materials.notions.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>✂️</span>
                    <div>
                      <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Notions</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {pattern.materials.notions.map(n => (
                          <span key={n} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '3px 10px', color: 'var(--text-body)', fontSize: 13 }}>{n}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prerequisites */}
          {pattern.prerequisites && pattern.prerequisites.length > 0 && (
            <div className="reveal" style={{ animationDelay: '0.08s', background: 'var(--bg-accent)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, marginBottom: 20, borderLeft: '3px solid var(--primary)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>You Should Know How To…</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pattern.prerequisites.map(p => (
                  <span key={p} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-body)', fontSize: 13 }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Visualization */}
          <div className="reveal" style={{ animationDelay: '0.09s', marginBottom: 20 }}>
            {pattern.visualization && pattern.visualization !== 'error' ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap', gap: 8 }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Pattern Diagram</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => generateVisualization(diagType)} disabled={generatingViz}
                      style={{ background: 'none', border: '1px solid var(--border-medium)', color: 'var(--text-muted)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: generatingViz ? 'default' : 'pointer', opacity: generatingViz ? 0.5 : 1 }}>
                      {generatingViz ? 'Regenerating…' : '↺ Regenerate'}
                    </button>
                    <button onClick={() => {
                      const blob = new Blob([pattern.visualization!], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = pattern.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-diagram.svg';
                      a.click(); URL.revokeObjectURL(url);
                    }} style={{ background: 'none', border: '1px solid var(--border-medium)', color: 'var(--text-muted)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                      ↓ Download SVG
                    </button>
                  </div>
                </div>
                {generatingViz
                  ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic' }}>Generating new diagram…</div>
                  : <div dangerouslySetInnerHTML={{ __html: pattern.visualization }} style={{ width: '100%', display: 'block', lineHeight: 0 }} />
                }
              </div>
            ) : pattern.visualization === 'error' ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic' }}>Diagram generation failed — the pattern is still complete.</p>
                <button onClick={() => generateVisualization(diagType)} disabled={generatingViz}
                  style={{ background: 'none', border: '1px solid var(--border-medium)', color: 'var(--primary)', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generate a diagram for this pattern:</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['auto', 'Auto'], ['schematic', 'Schematic'], ['stitch', 'Stitch chart'], ['colorwork', 'Colorwork grid']] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setDiagType(val)} style={{
                        padding: '4px 10px', borderRadius: 14, border: '1px solid',
                        borderColor: diagType === val ? 'var(--primary)' : 'var(--border-medium)',
                        background: diagType === val ? 'var(--primary)' : 'transparent',
                        color: diagType === val ? 'var(--primary-text)' : 'var(--text-muted)',
                        cursor: 'pointer', fontSize: 11,
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => generateVisualization(diagType)} disabled={generatingViz} style={{
                  width: '100%', background: 'var(--bg-input)', border: '1px dashed var(--border-medium)',
                  borderRadius: 8, padding: '12px', color: generatingViz ? 'var(--text-faint)' : 'var(--text-muted)',
                  fontSize: 13, cursor: generatingViz ? 'default' : 'pointer', textAlign: 'center',
                }}>
                  {generatingViz ? '🗒️ Generating diagram… (10–20 sec)' : '🗒️ Generate Pattern Diagram'}
                </button>
              </div>
            )}
          </div>

          {/* Section nav — ✓ on visited tabs (except currently active) */}
          {pattern.sections && pattern.sections.length > 1 && (
            <div className="section-nav-sticky reveal" style={{ animationDelay: '0.1s' }}>
              {pattern.sections.map((sec, i) => (
                <button key={i}
                  className={`section-nav-pill ${activeOutputSection === i ? 'active' : ''}`}
                  onClick={() => {
                    setActiveOutputSection(i);
                    setVisitedSections(prev => new Set([...prev, i]));
                    document.getElementById(`gen-section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {visitedSections.has(i) && i !== activeOutputSection && (
                    <span style={{ marginRight: 4, opacity: 0.6, fontSize: 10 }}>✓</span>
                  )}
                  {sec.title}
                </button>
              ))}
            </div>
          )}

          {/* Abbreviations — flex-start so long definitions wrap cleanly */}
          {pattern.abbreviations && Object.keys(pattern.abbreviations).length > 0 && (
            <div className="reveal" style={{ animationDelay: '0.12s', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Abbreviations</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {Object.entries(pattern.abbreviations).map(([abbrev, explanation]) => (
                  <div key={abbrev} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 13, fontFamily: 'monospace', minWidth: 40, flexShrink: 0, paddingTop: 1 }}>{abbrev}</span>
                    <span style={{ color: 'var(--text-body)', fontSize: 13, lineHeight: 1.5 }}>— {explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extras */}
          {pattern.extras && pattern.extras.map((extra, i) => (
            <div key={i} className="reveal" style={{ animationDelay: `${0.14 + i * 0.04}s`, marginBottom: 20 }}>
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
            <div className="reveal" style={{ animationDelay: '0.18s', marginBottom: 20 }}>
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
            <div key={i} id={`gen-section-${i}`} className="reveal" style={{ animationDelay: `${0.22 + i * 0.05}s`, marginBottom: 24, scrollMarginTop: 60 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{sec.title}</p>
                <button onClick={() => regenerateSection(i)} disabled={regeneratingSection !== null}
                  style={{ background: 'none', border: '1px solid var(--border-medium)', color: 'var(--text-faint)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: regeneratingSection !== null ? 'default' : 'pointer', opacity: regeneratingSection !== null ? 0.4 : 1 }}>
                  {regeneratingSection === i ? '↺ Regenerating…' : '↺ Regenerate section'}
                </button>
              </div>
              {regeneratingSection === i ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic', background: 'var(--bg-card)', borderRadius: 8 }}>Rewriting this section…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sec.content.split('\n').filter(Boolean).map((line, j) => {
                    const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
                    if (stepMatch) {
                      const effectiveDifficulty = stepDifficulty(pattern.stepDifficulty, sec.title, stepMatch[1], pattern.metadata?.['Difficulty']);
                      return (
                        <div key={j} className="step-card reveal" style={{
                          animationDelay: `${0.24 + i * 0.05 + j * 0.025}s`,
                          display: 'flex', gap: 12, background: 'var(--bg-card)',
                          border: '1px solid var(--border-light)',
                          borderLeft: `3px solid ${difficultyColor(effectiveDifficulty)}`,
                          borderRadius: 8, padding: '12px 14px',
                        }}>
                          <span style={{ background: 'var(--primary)', color: 'var(--primary-text)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{stepMatch[1]}</span>
                          <p style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6, margin: 0 }}
                            dangerouslySetInnerHTML={{ __html: stepMatch[2].replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>') }}
                          />
                        </div>
                      );
                    }
                    return <p key={j} style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6, padding: '4px 14px' }}>{line}</p>;
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Save footer — inline state, no alert() dialogs */}
          <div className="reveal" style={{ animationDelay: '0.1s', borderTop: '1px solid var(--border-light)', paddingTop: 20, marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {!saved && (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Happy with this pattern? Save it to your library.</p>
                <select value={saveCategory} onChange={e => setSaveCategory(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: saveCategory ? 'var(--text-body)' : 'var(--text-faint)', fontSize: 13, cursor: 'pointer' }}>
                  <option value="">Category…</option>
                  {['Hats', 'Body', 'Feet', 'Bags', 'Misc'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </>
            )}
            <button
              className={saved ? '' : 'btn btn-primary'}
              disabled={saved}
              onClick={handleSaveToPatterns}
              style={saved ? { background: 'var(--success-vivid)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'default', flexShrink: 0 } : { flexShrink: 0 }}
            >
              {saved ? '✓ Saved to Patterns' : '💾 Save to Patterns'}
            </button>
            {saved && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Find it in your <a href="/patterns" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Patterns library</a>.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = labelStyle;
const inp = inputStyle;
const sel = selectStyle;
