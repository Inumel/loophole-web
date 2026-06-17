// ── Loophole Design Tokens ─────────────────────────────────────────────────
// All colours, radii, shadows and font names live here.
// To change the theme, edit this file only.
// CSS variables are defined in index.css :root — keep both in sync.

export const colors = {
  // Backgrounds
  bgPage:        '#f5eaec',  // Main content background
  bgSidebar:     '#fdf6f0',  // Sidebar background
  bgCard:        'rgba(255,255,255,0.75)',  // Card background
  bgCardHover:   'rgba(255,255,255,0.95)',  // Card hover background
  bgInput:       'rgba(255,255,255,0.8)',   // Input/select background
  bgInputFocus:  '#ffffff',
  bgMuted:       'rgba(255,255,255,0.5)',   // Muted surface (e.g. secondary cards)
  bgAccent:      '#f0dff0',  // Soft lavender accent surface (active nav, chips)
  bgWarn:        '#fdf0e0',  // Warning surface

  // Borders
  borderLight:   '#e8d5c4',  // Sidebar border, default card border
  borderMedium:  '#e0cdc4',  // Slightly stronger border
  borderAccent:  '#c49bbf',  // Purple/mauve accent border (hover, active)
  borderInput:   '#ddd0c8',  // Input border

  // Text
  textPrimary:   '#5c3d2e',  // Headings, card titles
  textBody:      '#3d2a2e',  // Body text
  textMuted:     '#a08070',  // Subtitles, labels
  textFaint:     '#b8a090',  // Placeholder, meta text
  textAccent:    '#9b6b8a',  // Links, active nav, logo

  // Brand / interactive
  primary:       '#c49bbf',  // Primary button, key accent
  primaryText:   '#ffffff',  // Text on primary button
  primaryHover:  '#b888b0',  // Primary button hover

  // Status badges
  badgeActive:   { bg: '#d4edda', text: '#2d6a4f' },
  badgeDone:     { bg: '#e8d5f0', text: '#7b4f9e' },
  badgePaused:   { bg: '#fdecc8', text: '#92600a' },
  badgeFrogged:  { bg: '#fdd5d5', text: '#9e2a2a' },

  // Semantic
  success:       '#2d6a4f',
  successBg:     '#d4edda',
  warning:       '#92600a',
  warningBg:     '#fdecc8',
  danger:        '#9e2a2a',
  dangerBg:      '#fdd5d5',
  info:          '#9b6b8a',
  infoBg:        '#f0dff0',

  // Vivid semantic accents (used for live status dots, stat highlights, in-stock indicators)
  // These read well on both light and dark surfaces, unlike the muted badge tones above
  successVivid:    '#10B981',
  successVividBg:  'rgba(16,185,129,0.13)',
  warningVivid:    '#F59E0B',
  warningVividBg:  'rgba(245,158,11,0.13)',
  dangerVivid:     '#EF4444',
  dangerVividBg:   'rgba(239,68,68,0.13)',
  neutralVivid:    '#6B7280',
  neutralVividBg:  'rgba(107,114,128,0.13)',
} as const;

export const fonts = {
  body:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  heading: "'Lora', Georgia, serif",
} as const;

export const radii = {
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  full: 9999,
} as const;

export const shadows = {
  card:      '0 1px 3px rgba(180,120,120,0.08)',
  cardHover: '0 4px 12px rgba(180,120,120,0.15)',
  btn:       '0 3px 8px rgba(0,0,0,0.10)',
} as const;

// ── Convenience style objects ──────────────────────────────────────────────
// Use these in inline style props to keep pages clean.
//
// IMPORTANT: these use CSS custom properties (var(--...)), NOT the `colors`
// JS object above, so that components using them correctly respond to the
// dark mode toggle. The `colors` object above is light-mode-only reference
// data — don't use it directly for component styling, since it won't react
// to theme changes the way var(--...) does.

export const cardStyle: React.CSSProperties = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border-light)',
  borderRadius: radii.lg,
  padding:      '16px 20px',
  marginBottom: 10,
  boxShadow:    'var(--shadow-card)',
};

export const inputStyle: React.CSSProperties = {
  width:        '100%',
  background:   'var(--bg-input)',
  border:       '1px solid var(--border-input)',
  borderRadius: radii.md,
  padding:      '9px 12px',
  color:        'var(--text-body)',
  fontSize:     14,
  fontFamily:   fonts.body,
  boxSizing:    'border-box',
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

export const labelStyle: React.CSSProperties = {
  display:      'block',
  color:        'var(--text-muted)',
  fontSize:     12,
  fontWeight:   500,
  marginBottom: 6,
};

export const sectionHeaderStyle: React.CSSProperties = {
  color:          'var(--primary)',
  fontSize:       11,
  fontWeight:     700,
  textTransform:  'uppercase',
  letterSpacing:  1,
  marginBottom:   10,
};

export const metaItemStyle: React.CSSProperties = {
  background:   'var(--bg-muted)',
  border:       '1px solid var(--border-light)',
  borderRadius: radii.md,
  padding:      '10px 12px',
};

// ── Difficulty accent color ────────────────────────────────────────────────
// Maps a pattern/step difficulty label to a semantic vivid color.
// Used as a left-border accent on step cards so the instructions list
// carries an at-a-glance signal of how involved the pattern is. Shared
// between the live Pattern Generator output and saved/parsed pattern
// detail views so both stay visually consistent.
const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: 'var(--success-vivid)',
  Easy: 'var(--success-vivid)',
  Intermediate: 'var(--warning-vivid)',
  Advanced: 'var(--danger-vivid)',
};
export function difficultyColor(difficulty?: string | null): string {
  if (!difficulty) return 'var(--primary)';
  return DIFFICULTY_COLOR[difficulty] ?? 'var(--primary)';
}

// Resolves the effective difficulty for one step: checks the per-step map
// first (keyed "<section title>|<step number>"), falling back to the
// pattern's overall difficulty if that step isn't called out specifically.
// Most patterns are uniform difficulty throughout, so stepDifficulty is
// expected to be sparse — only the steps that genuinely differ get an entry.
export function stepDifficulty(
  stepDifficultyMap: Record<string, string> | null | undefined,
  sectionTitle: string,
  stepNumber: number | string,
  patternDifficulty?: string | null
): string | null {
  const key = `${sectionTitle}|${stepNumber}`;
  return stepDifficultyMap?.[key] ?? patternDifficulty ?? null;
}
