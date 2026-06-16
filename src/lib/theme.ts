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

export const cardStyle: React.CSSProperties = {
  background:   colors.bgCard,
  border:       `1px solid ${colors.borderLight}`,
  borderRadius: radii.lg,
  padding:      '16px 20px',
  marginBottom: 10,
  boxShadow:    shadows.card,
};

export const inputStyle: React.CSSProperties = {
  width:        '100%',
  background:   colors.bgInput,
  border:       `1px solid ${colors.borderInput}`,
  borderRadius: radii.md,
  padding:      '9px 12px',
  color:        colors.textBody,
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
  color:        colors.textMuted,
  fontSize:     12,
  fontWeight:   500,
  marginBottom: 6,
};

export const sectionHeaderStyle: React.CSSProperties = {
  color:          colors.primary,
  fontSize:       11,
  fontWeight:     700,
  textTransform:  'uppercase',
  letterSpacing:  1,
  marginBottom:   10,
};

export const metaItemStyle: React.CSSProperties = {
  background:   colors.bgMuted,
  border:       `1px solid ${colors.borderLight}`,
  borderRadius: radii.md,
  padding:      '10px 12px',
};
