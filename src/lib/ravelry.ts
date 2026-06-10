const RAVELRY_BASE = 'https://api.ravelry.com';

function getAuthHeader(): string {
  const id = import.meta.env.VITE_RAVELRY_CLIENT_ID ?? '';
  const secret = import.meta.env.VITE_RAVELRY_CLIENT_SECRET ?? '';
  return 'Basic ' + btoa(`${id}:${secret}`);
}

export async function searchRavelryPatterns(query: string) {
  const res = await fetch(
    `${RAVELRY_BASE}/patterns/search.json?query=${encodeURIComponent(query)}&page_size=20`,
    { headers: { Authorization: getAuthHeader() } }
  );
  if (!res.ok) throw new Error('Ravelry search failed');
  const data = await res.json();
  return data.patterns ?? [];
}

export async function getRavelryPattern(id: number) {
  const res = await fetch(
    `${RAVELRY_BASE}/patterns/${id}.json`,
    { headers: { Authorization: getAuthHeader() } }
  );
  if (!res.ok) throw new Error('Ravelry pattern fetch failed');
  const data = await res.json();
  return data.pattern;
}

export function mapRavelryPattern(p: Record<string, unknown>) {
  const gaugeStitches = p.gauge as number | null ?? null;
  const gaugeRows = p.gauge_divisor as number | null ?? null;
  const gaugeUnit = p.gauge_description as string | null ?? 'per 10cm';
  const needleSizes = (p.pattern_needle_sizes as Array<Record<string, unknown>> | null)
    ?.map(n => String(n.pretty_metric ?? n.name ?? '')).filter(Boolean) ?? [];
  const needleSize = needleSizes.join(', ') || null;
  const yarnWeight = (p.yarn_weight as Record<string, unknown> | null)?.name as string | null ?? null;
  const difficultyRating = p.difficulty_average as number | null;
  let difficulty: string | null = null;
  if (difficultyRating !== null) {
    if (difficultyRating <= 1.5) difficulty = 'Beginner';
    else if (difficultyRating <= 2.5) difficulty = 'Easy';
    else if (difficultyRating <= 3.5) difficulty = 'Intermediate';
    else difficulty = 'Advanced';
  }
  const category = (p.pattern_categories as Array<Record<string, unknown>> | null)?.[0]?.name as string | null ?? null;
  const yarnQuantity = (p.packs as Array<Record<string, unknown>> | null)
    ?.map(pack => ({
      amount: (pack.quantity_description as string ?? '').match(/\d+/)?.[0]
        ? parseInt((pack.quantity_description as string).match(/\d+/)![0])
        : null,
      unit: (pack.unit_of_measure as string ?? 'skeins'),
      color: pack.color_name as string | undefined,
    })).filter(p => p.amount !== null) ?? [];
  const stitchPatterns = (p.pattern_attributes as Array<Record<string, unknown>> | null)
    ?.map(a => String(a.permalink ?? '')).filter(Boolean) ?? [];
  return {
    category, yarn_weight: yarnWeight, needle_size: needleSize,
    gauge_stitches: gaugeStitches, gauge_rows: gaugeRows, gauge_unit: gaugeUnit,
    difficulty,
    yarn_quantity: yarnQuantity.length > 0 ? yarnQuantity : null,
    stitch_patterns: stitchPatterns.length > 0 ? stitchPatterns : null,
  };
}
