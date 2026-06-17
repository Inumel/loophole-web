import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { explainAbbreviations } from '../lib/claude';

const ABBREV_PATTERN = /\*?(k\d*tog|p\d*tog|ssk|ssp|skp|sk2p|s2kp|kfb|pfb|m1[lrp]?|k[0-9]+|p[0-9]+|k(?![a-z])|p(?![a-z])|yo|sl\d*[kp]?|psso|p2sso|tbl|tfl|wyib|wyif|pm|sm|rm|bor|cn|dpns?|circ|mc|cc|c[0-9]+[fb]|t[0-9]+[fb]|w&t|mb|pb|pu[ak]*|ktbl|ptbl|k1b|p1b|co|bo|rs|ws|rep|rnd|rnds|beg|rem|alt|cont|foll|inc|dec|pat{1,2}|tw|fc|bc|lh|rh|yf|yb|yfwd|yon)\b/gi;

// Module-level cache persists across renders
const globalCache: Record<string, string> = {};

function tokenize(step: string): Array<{ text: string; isAbbrev: boolean; key: string }> {
  const tokens: Array<{ text: string; isAbbrev: boolean; key: string }> = [];
  let lastIndex = 0;
  const regex = new RegExp(ABBREV_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(step)) !== null) {
    const fullMatch = match[0];
    const hasStar = fullMatch.startsWith('*');
    const abbrevText = hasStar ? fullMatch.slice(1) : fullMatch;
    const matchStart = match.index;
    const abbrevStart = matchStart + (hasStar ? 1 : 0);

    // Plain text (and any leading *) before this abbreviation
    if (matchStart > lastIndex) {
      tokens.push({ text: step.slice(lastIndex, matchStart), isAbbrev: false, key: '' });
    }
    // The * itself as plain text
    if (hasStar) {
      tokens.push({ text: '*', isAbbrev: false, key: '' });
    }
    // The abbreviation
    tokens.push({ text: abbrevText, isAbbrev: true, key: abbrevText.toLowerCase() });
    lastIndex = matchStart + fullMatch.length;
  }

  if (lastIndex < step.length) {
    tokens.push({ text: step.slice(lastIndex), isAbbrev: false, key: '' });
  }
  return tokens;
}

type Props = { step: string; index: number };

export default function StepText({ step, index }: Props) {
  const [abbrevs, setAbbrevs] = useState<Record<string, string>>({});
  const [tooltip, setTooltip] = useState<{ abbrev: string; x: number; y: number } | null>(null);

  useEffect(() => {
    async function load() {
      const tokens = tokenize(step);
      const candidates = [...new Set(tokens.filter(t => t.isAbbrev).map(t => t.key))];
      if (candidates.length === 0) return;

      // Pre-fill obvious numbered abbreviations locally (k5 = knit 5, p3 = purl 3)
      const preloaded: Record<string, string> = {};
      for (const c of candidates) {
        const knit = c.match(/^k(\d+)$/);
        const purl = c.match(/^p(\d+)$/);
        if (knit) preloaded[c] = `Knit ${knit[1]} stitches.`;
        else if (purl) preloaded[c] = `Purl ${purl[1]} stitches.`;
      }
      if (Object.keys(preloaded).length > 0) {
        Object.assign(globalCache, preloaded);
        setAbbrevs(prev => ({ ...prev, ...preloaded }));
      }

      // Already cached
      const cached: Record<string, string> = { ...preloaded };
      const missing: string[] = [];
      for (const c of candidates) {
        if (globalCache[c]) cached[c] = globalCache[c];
        else if (!preloaded[c]) missing.push(c);
      }

      if (missing.length > 0) {
        // Look up in Supabase
        const { data } = await supabase
          .from('knitting_abbreviations')
          .select('abbreviation, explanation')
          .in('abbreviation', missing);

        const found = new Set<string>();
        for (const row of data ?? []) {
          globalCache[row.abbreviation] = row.explanation;
          cached[row.abbreviation] = row.explanation;
          found.add(row.abbreviation);
        }

        // Call Claude for anything still missing
        const stillMissing = missing.filter(m => !found.has(m));
        if (stillMissing.length > 0) {
          try {
            const claudeResults = await explainAbbreviations(step);
            for (const [abbrev, explanation] of Object.entries(claudeResults)) {
              const key = abbrev.toLowerCase();
              globalCache[key] = explanation;
              cached[key] = explanation;
              supabase.from('knitting_abbreviations').upsert(
                { abbreviation: key, explanation, category: 'auto' },
                { onConflict: 'abbreviation', ignoreDuplicates: true }
              );
            }
          } catch { /* non-fatal */ }
        }
      }

      setAbbrevs(prev => ({ ...prev, ...cached }));
    }
    load();
  }, [step]);

  const leadingNumMatch = step.match(/^(\d+)\.\s+(.+)/s);
  const displayNum = leadingNumMatch ? leadingNumMatch[1] : String(index + 1);
  const cleanStep = leadingNumMatch ? leadingNumMatch[2] : step;
  const tokens = tokenize(cleanStep);

  return (
    <span style={{ position: 'relative' }}>
      <strong style={{ color: 'var(--primary)' }}>{displayNum}. </strong>
      {tokens.map((token, i) => {
        if (!token.isAbbrev) return <span key={i}>{token.text}</span>;
        const definition = abbrevs[token.key];
        return (
          <span key={i} style={{ position: 'relative', display: 'inline' }}>
            <span
              onMouseEnter={(e) => {
                if (!definition) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTooltip({ abbrev: token.key, x: rect.left, y: rect.top });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                color: definition ? 'var(--text-accent)' : 'inherit',
                fontWeight: definition ? 700 : 'inherit',
                borderBottom: definition ? '1px dashed var(--primary)' : 'none',
                cursor: definition ? 'help' : 'default',
              }}
            >
              {token.text}
            </span>
            {tooltip?.abbrev === token.key && definition && (
              <span style={{
                position: 'fixed',
                left: Math.min(tooltip.x, window.innerWidth - 300),
                top: tooltip.y - 8,
                transform: 'translateY(-100%)',
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--primary)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                color: 'var(--text-body)',
                maxWidth: 280,
                zIndex: 9999,
                pointerEvents: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                lineHeight: 1.5,
                whiteSpace: 'normal',
              }}>
                <strong style={{ color: 'var(--text-accent)', display: 'block', marginBottom: 4 }}>
                  {token.text.toUpperCase()}
                </strong>
                {definition}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
