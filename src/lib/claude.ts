const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

function getToken(): string | null {
  return sessionStorage.getItem('loophole_token');
}

async function callClaude(body: object): Promise<{ content: Array<{ text: string }> }> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: `You are a knitting pattern parser. Extract the key information from this knitting pattern PDF and return a structured JSON object with these fields:
- name: pattern name
- designer: designer name if present
- difficulty: one of "Beginner", "Easy", "Intermediate", "Advanced", or ""
- sizes: array of size labels (e.g. ["S", "M", "L"]. If only one size, use ["One Size"])
- gauge: { stitches, rows, unit }
- needles: needle size(s) as a string
- yarn_weight: yarn weight category
- yarn_quantity: array of { amount: number, unit: string, color?: string, note?: string }
- stitch_patterns: array of stitch pattern names
- sections: array of { title: string, steps_by_size: object } where steps_by_size keys are size labels and values are arrays of instruction strings fully written out for that size.

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
