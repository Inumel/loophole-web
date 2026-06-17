const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

function getToken(): string | null {
  return localStorage.getItem('loophole_token');
}

async function callClaude(body: object): Promise<{ content: Array<{ text: string }> }> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'x-loophole-token': token,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Claude proxy error: ${res.status}`);
  }

  return res.json();
}

export async function parsePatternWithClaude(pdfBase64: string): Promise<object> {
  const data = await callClaude({
    max_tokens: 8096, // signals proxy to use Sonnet
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: `You are an expert knitting pattern parser. Extract all information from this pattern PDF and return a structured JSON object.

CRITICAL RULES:
1. SIZE EXPANSION: Patterns often write sizes in brackets like "Cast on 80 (90, 100, 110) sts". You MUST expand these into separate per-size instructions. If sizes are [S, M, L, XL], then "Cast on 80 (90, 100, 110) sts" becomes:
   - S: "Cast on 80 sts"
   - M: "Cast on 90 sts"
   - L: "Cast on 100 sts"
   - XL: "Cast on 110 sts"
   Every instruction must be fully written out for each size with no brackets remaining.

1b. COLOR VARIATIONS: If the pattern includes optional color variations, stripes, or style variations (e.g. "One Stripe Hat", "Pinstripe Variation", "Rainbow Version"), do NOT treat them as regular sections. Instead:
   - Add a "color_variations" field at the top level: array of variation name strings
   - For each section that has color-specific steps, add a "steps_by_variation" object alongside steps_by_size, where keys are variation names and values are arrays of steps
   - Sections that apply to ALL variations (cast on, basic body, finishing) should use steps_by_size as normal
   - Only colour/style optional variants go in steps_by_variation — not size differences

2. GAUGE: Patterns write gauge many different ways. Extract ALL components correctly:
   - "22 sts and 30 rows = 4 inches" → stitches: 22, rows: 30, unit: "per 4in"
   - "22 sts/4in" → stitches: 22, rows: null, unit: "per 4in"
   - "22 stitches over 10cm" → stitches: 22, rows: null, unit: "per 10cm"
   - "22 sts x 30 rows over 10cm in stockinette" → stitches: 22, rows: 30, unit: "per 10cm"
   - "12 sts = 4 inches" → stitches: 12, rows: null, unit: "per 4in"
   If rows are not mentioned, set rows to null rather than guessing.
   unit must be exactly "per 10cm" or "per 4in".

3. YARN QUANTITY: Extract quantities for ALL sizes if given, not just the smallest. Use format:
   { amount: number, unit: string, size?: string, color?: string, note?: string }

4. SECTIONS: Break the pattern into logical sections (e.g. "Cast On", "Body", "Sleeve", "Finishing"). Each section gets its own steps_by_size object.

5. ABBREVIATIONS: If the pattern includes an abbreviations glossary, extract it as an object.

6. STEP DIFFICULTY: If the pattern explicitly marks varying difficulty across sections or steps (e.g. "EASY: Ribbing" vs "ADVANCED: Cable panel", or a note like "this part is tricky"), capture that as a stepDifficulty object. This is OPTIONAL — omit it entirely if the pattern doesn't call out varying difficulty, since the top-level difficulty field already covers the uniform case.

Return a JSON object with these fields:
- name: pattern name
- designer: designer name if present
- difficulty: one of "Beginner", "Easy", "Intermediate", "Advanced", or ""
- sizes: array of size labels exactly as written (e.g. ["S", "M", "L"] or ["One Size"])
- color_variations: array of optional colour/style variation names if present, empty array if none
- gauge: { stitches, rows, unit }
- needles: needle size(s) as a string
- yarn_weight: yarn weight category (e.g. "DK", "Worsted", "Fingering")
- yarn_quantity: array of { amount, unit, size?, color?, note? } — include all sizes
- stitch_patterns: array of stitch pattern names used
- abbreviations: object of { abbrev: explanation } from the pattern's own glossary if present
- stepDifficulty: OPTIONAL object of { "<section title>|<step number>": "Beginner"|"Easy"|"Intermediate"|"Advanced" } for steps whose difficulty is explicitly called out as differing from the rest of the pattern. Omit entirely if not applicable.
- sections: array of { title: string, steps_by_size: object, steps_by_variation?: object } where every size has fully expanded instructions with no brackets. steps_by_variation only present for sections with colour-specific steps.

Return ONLY a raw JSON object. No markdown, no code fences. Start with { and end with }.`,
        },
      ],
    }],
  });

  let text = data.content?.[0]?.text ?? '{}';
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  try { return JSON.parse(text); } catch { return { name: '', sections: [] }; }
}

export async function explainAbbreviations(step: string): Promise<Record<string, string>> {
  const data = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a knitting expert. Find all knitting abbreviations in this pattern instruction and explain each one clearly and concisely.

Instruction: "${step}"

Return a JSON object where each key is an abbreviation and each value is a plain English explanation (1-2 sentences max). Only include actual knitting abbreviations.

Return ONLY raw JSON. No markdown. Start with { and end with }.`,
    }],
  });

  let text = data.content?.[0]?.text ?? '{}';
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  try { return JSON.parse(text) as Record<string, string>; } catch { return {}; }
}
