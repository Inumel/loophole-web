import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// ── Recently viewed ──────────────────────────────────────────────────────────
// Each page that can appear in recent items calls recordRecentItem() on mount.
// Items are stored in localStorage as a JSON array, capped at 6 entries.

export type RecentItem = {
  id: string;
  name: string;
  type: 'project' | 'pattern' | 'yarn';
  meta: string;        // e.g. "active · 7 steps", "generated", "420 yds in stock"
  path: string;        // navigation target isn't directly used — we navigate to the section
  color: string;       // dot colour hex
  visitedAt: string;
};

const RECENT_KEY = 'loophole_recent_items';

export function recordRecentItem(item: Omit<RecentItem, 'visitedAt'>) {
  try {
    const existing: RecentItem[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    const updated = [
      { ...item, visitedAt: new Date().toISOString() },
      ...existing.filter(e => !(e.id === item.id && e.type === item.type)),
    ].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function loadRecentItems(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

// ── Section colour map ────────────────────────────────────────────────────────
const SECTION_COLORS = {
  project:  { icon: '📁', bg: '#F3EEFA', text: '#7F77DD', dot: '#7F77DD' },
  pattern:  { icon: '📖', bg: '#E1F5EE', text: '#1D9E75', dot: '#1D9E75' },
  stash:    { icon: '📦', bg: '#FAEEDA', text: '#BA7517', dot: '#BA7517' },
  tools:    { icon: '🔧', bg: '#FAECE7', text: '#D85A30', dot: '#D85A30' },
  timeline: { icon: '📅', bg: '#FBEAF0', text: '#D4537E', dot: '#D4537E' },
  workshop: { icon: '🛠', bg: '#F3EEFA', text: '#7F77DD', dot: '#7F77DD' },
};

// ── Stats types ───────────────────────────────────────────────────────────────
type Stats = {
  activeProjects: number;
  totalPatterns: number;
  totalYarns: number;
  totalTools: number;
  totalSessions: number;
  completedProjects: number;
  totalMinutes: number;
  totalStepsCompleted: number;
};

// ── Workshop sub-pages ────────────────────────────────────────────────────────
const WORKSHOP_ITEMS = [
  { label: '✨ Generate Pattern', path: '/generate' },
  { label: '📐 Gauge & Needles',  path: '/gauge' },
  { label: '🧶 Yarn Substitute',  path: '/substitute' },
  { label: 'Abbreviations',       path: '/abbreviations' },
];

export default function DashboardPage() {
  const { unlocked } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [workshopExpanded, setWorkshopExpanded] = useState(false);

  useEffect(() => {
    setRecent(loadRecentItems());
    if (unlocked) fetchStats();
  }, [unlocked]);

  async function fetchStats() {
    const [
      { data: projects },
      { data: patterns },
      { data: yarns },
      { data: tools },
      { data: sessions },
      { data: steps },
    ] = await Promise.all([
      supabase.from('projects').select('id, status'),
      supabase.from('patterns').select('id'),
      supabase.from('yarn_catalog').select('id'),
      supabase.from('tools').select('id'),
      supabase.from('knitting_sessions').select('duration_minutes'),
      supabase.from('project_step_progress').select('completed').eq('completed', true),
    ]);

    setStats({
      activeProjects:      (projects ?? []).filter(p => p.status === 'active').length,
      completedProjects:   (projects ?? []).filter(p => p.status === 'completed').length,
      totalPatterns:       (patterns ?? []).length,
      totalYarns:          (yarns ?? []).length,
      totalTools:          (tools ?? []).length,
      totalSessions:       (sessions ?? []).length,
      totalMinutes:        (sessions ?? []).reduce((s, r) => s + (r.duration_minutes ?? 0), 0),
      totalStepsCompleted: (steps ?? []).length,
    });
  }

  function fmt(mins: number) {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const navCards = [
    { key: 'project',  label: 'Projects',  desc: 'Track progress, sessions and steps',          path: '/projects',  stat: stats ? `${stats.activeProjects} active` : '…' },
    { key: 'pattern',  label: 'Patterns',  desc: 'Saved, PDF, Ravelry and generated patterns',  path: '/patterns',  stat: stats ? `${stats.totalPatterns} saved` : '…' },
    { key: 'stash',    label: 'Stash',     desc: 'Yarn catalog with quantities and photos',      path: '/stash',     stat: stats ? `${stats.totalYarns} yarns` : '…' },
    { key: 'tools',    label: 'Tools',     desc: 'Needles, hooks, and notions',                  path: '/tools',     stat: stats ? `${stats.totalTools} items` : '…' },
    { key: 'timeline', label: 'Timeline',  desc: 'Gantt chart and session stats',                path: '/timeline',  stat: stats ? `${stats.totalSessions} sessions` : '…' },
    { key: 'workshop', label: 'Workshop',  desc: 'Generate, gauge, substitute, abbreviations',   path: null,         stat: '4 tools' },
  ] as const;

  const statCards = stats ? [
    { label: 'Steps completed', value: String(stats.totalStepsCompleted) },
    { label: 'Time knitted',    value: fmt(stats.totalMinutes) },
    { label: 'Sessions',        value: String(stats.totalSessions) },
    { label: 'Finished',        value: `${stats.completedProjects} projects` },
  ] : [];

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Nav cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {navCards.map(card => {
          const col = SECTION_COLORS[card.key];
          const isWorkshop = card.key === 'workshop';
          return (
            <div key={card.key}>
              <div
                onClick={() => {
                  if (isWorkshop) { setWorkshopExpanded(e => !e); return; }
                  if (!unlocked && card.key !== 'project') { navigate('/settings'); return; }
                  navigate(card.path!);
                }}
                className="card"
                style={{ cursor: 'pointer', marginBottom: 0, minHeight: 110, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: col.bg, color: col.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {col.icon}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{card.label}</span>
                    {isWorkshop && (
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{workshopExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{card.desc}</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginTop: 'auto' }}>{card.stat}</span>
              </div>

              {/* Workshop expanded sub-items */}
              {isWorkshop && workshopExpanded && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {WORKSHOP_ITEMS.map(item => (
                    <button key={item.path}
                      onClick={() => { if (!unlocked) { navigate('/settings'); return; } navigate(item.path); }}
                      style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                        borderRadius: 8, padding: '9px 14px', cursor: 'pointer',
                        color: 'var(--text-body)', fontSize: 13, fontWeight: 500,
                        textAlign: 'left', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recently viewed */}
      {recent.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Recently viewed
          </p>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden' }}>
            {recent.map((item, i) => (
              <div key={`${item.type}-${item.id}`}
                onClick={() => navigate(item.type === 'project' ? '/projects' : item.type === 'pattern' ? '/patterns' : '/stash')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', cursor: 'pointer',
                  borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{item.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.meta}</span>
                <span style={{ fontSize: 14, color: 'var(--text-faint)' }}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for locked users */}
      {!unlocked && (
        <div style={{ marginTop: 32, background: 'var(--bg-accent)', border: '1px solid var(--border-accent)', borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ color: 'var(--text-accent)', fontSize: 14, lineHeight: 1.6 }}>
            🔒 Some sections require full access.{' '}
            <span onClick={() => navigate('/settings')} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>
              Unlock in Settings →
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
