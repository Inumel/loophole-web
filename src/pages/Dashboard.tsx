import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// ── Recently viewed ──────────────────────────────────────────────────────────

export type RecentItem = {
  id: string;
  name: string;
  type: 'project' | 'pattern' | 'yarn';
  meta: string;
  path: string;
  color: string;
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

// ── Focus mode signal ─────────────────────────────────────────────────────────
// When the dashboard Focus button is clicked, we store the target project ID
// in sessionStorage. ProjectDetail reads this on mount and opens focus mode
// automatically if it matches its own ID.
export const FOCUS_SIGNAL_KEY = 'loophole_focus_on_open';

// ── Section colour map ────────────────────────────────────────────────────────
const SECTION_COLORS: Record<string, { icon: string; bg: string; text: string }> = {
  project:  { icon: '📁', bg: '#F3EEFA', text: '#7F77DD' },
  pattern:  { icon: '📖', bg: '#E1F5EE', text: '#1D9E75' },
  stash:    { icon: '📦', bg: '#FAEEDA', text: '#BA7517' },
  tools:    { icon: '🔧', bg: '#FAECE7', text: '#D85A30' },
  timeline: { icon: '📅', bg: '#FBEAF0', text: '#D4537E' },
  workshop: { icon: '🛠', bg: '#F3EEFA', text: '#7F77DD' },
};

const WORKSHOP_ITEMS = [
  { label: '✨ Generate Pattern', path: '/generate' },
  { label: '📐 Gauge & Needles',  path: '/gauge' },
  { label: '🧶 Yarn Substitute',  path: '/substitute' },
  { label: 'Abbreviations',       path: '/abbreviations' },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type ActiveProject = {
  id: string;
  name: string;
  status: string;
  current_row: number;
  total_steps: number;
};

type Stats = {
  totalPatterns: number;
  totalYarns: number;
  totalTools: number;
  totalSessions: number;
  completedProjects: number;
  totalMinutes: number;
  totalStepsCompleted: number;
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { unlocked } = useAuth();
  const navigate = useNavigate();
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [workshopExpanded, setWorkshopExpanded] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    setRecent(loadRecentItems());
    fetchActiveProjects();
    if (unlocked) fetchStats();
  }, [unlocked]);

  async function fetchActiveProjects() {
    setLoadingProjects(true);
    // Fetch recent active projects with step progress counts
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status, current_row')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(3);

    if (!projects || projects.length === 0) {
      setActiveProjects([]);
      setLoadingProjects(false);
      return;
    }

    // For each project, get total step count from its linked pattern
    const { data: patternLinks } = await supabase
      .from('projects')
      .select('id, pattern:patterns(parsed_guide)')
      .in('id', projects.map(p => p.id));

    const totalStepsMap: Record<string, number> = {};
    for (const pl of patternLinks ?? []) {
      const guide = (pl.pattern as { parsed_guide?: Record<string, unknown> } | null)?.parsed_guide;
      const sections = Array.isArray(guide?.sections) ? guide!.sections as Array<{ steps?: string[] }> : [];
      const total = sections.reduce((s, sec) => s + (Array.isArray(sec.steps) ? sec.steps.length : 0), 0);
      totalStepsMap[pl.id] = total;
    }

    setActiveProjects(projects.map(p => ({
      ...p,
      total_steps: totalStepsMap[p.id] ?? 0,
    })));
    setLoadingProjects(false);
  }

  async function fetchStats() {
    const [
      { data: patterns },
      { data: yarns },
      { data: tools },
      { data: sessions },
      { data: completed },
      { data: steps },
    ] = await Promise.all([
      supabase.from('patterns').select('id'),
      supabase.from('yarn_catalog').select('id'),
      supabase.from('tools').select('id'),
      supabase.from('knitting_sessions').select('duration_minutes'),
      supabase.from('projects').select('id').eq('status', 'completed'),
      supabase.from('project_step_progress').select('completed').eq('completed', true),
    ]);

    setStats({
      totalPatterns:       (patterns ?? []).length,
      totalYarns:          (yarns ?? []).length,
      totalTools:          (tools ?? []).length,
      totalSessions:       (sessions ?? []).length,
      completedProjects:   (completed ?? []).length,
      totalMinutes:        (sessions ?? []).reduce((s, r) => s + (r.duration_minutes ?? 0), 0),
      totalStepsCompleted: (steps ?? []).length,
    });
  }

  function fmtTime(mins: number) {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function handleFocusMode() {
    // Pick the most-in-progress active project by current_row
    const target = [...activeProjects].sort((a, b) => b.current_row - a.current_row)[0];
    if (!target) return;
    sessionStorage.setItem(FOCUS_SIGNAL_KEY, target.id);
    navigate('/projects');
  }

  const navCards = [
    { key: 'project',  label: 'Projects',  desc: 'All projects',             path: '/projects',  stat: stats ? `${activeProjects.length} active` : '…' },
    { key: 'pattern',  label: 'Patterns',  desc: 'Your library',             path: '/patterns',  stat: stats ? `${stats.totalPatterns} saved` : '…' },
    { key: 'stash',    label: 'Stash',     desc: 'Yarn catalog',             path: '/stash',     stat: stats ? `${stats.totalYarns} yarns` : '…' },
    { key: 'tools',    label: 'Tools',     desc: 'Needles & notions',        path: '/tools',     stat: stats ? `${stats.totalTools} items` : '…' },
    { key: 'timeline', label: 'Timeline',  desc: 'Sessions & stats',         path: '/timeline',  stat: stats ? `${stats.totalSessions} sessions` : '…' },
    { key: 'workshop', label: 'Workshop',  desc: 'Generate, gauge & more',   path: null,         stat: '4 tools' },
  ] as const;

  const statCards = stats ? [
    { label: 'Steps completed', value: String(stats.totalStepsCompleted) },
    { label: 'Time knitted',    value: fmtTime(stats.totalMinutes) },
    { label: 'Sessions',        value: String(stats.totalSessions) },
    { label: 'Finished',        value: `${stats.completedProjects} projects` },
  ] : [];

  return (
    <div style={{ maxWidth: 860 }}>

      {/* ── Active projects ──────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Active projects
          </p>
          <button onClick={() => navigate('/projects')}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            View all →
          </button>
        </div>

        {loadingProjects ? (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '20px', color: 'var(--text-faint)', fontSize: 13 }}>Loading…</div>
        ) : activeProjects.length === 0 ? (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No active projects yet.</p>
            <button onClick={() => navigate('/projects')} className="btn btn-primary" style={{ marginTop: 12, fontSize: 13, padding: '7px 16px' }}>
              + Start a project
            </button>
          </div>
        ) : (
          <>
            {activeProjects.map(p => {
              const pct = p.total_steps > 0 ? Math.round((p.current_row / p.total_steps) * 100) : 0;
              return (
                <div key={p.id}
                  onClick={() => { navigate('/projects'); recordRecentItem({ id: p.id, name: p.name, type: 'project', meta: `active · ${p.current_row} steps`, path: '/projects', color: '#7F77DD' }); }}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    borderLeft: '3px solid var(--primary)',
                    borderRadius: 10, padding: '14px 16px', marginBottom: 8,
                    cursor: 'pointer', transition: 'background 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {p.current_row} of {p.total_steps > 0 ? p.total_steps : '?'} steps
                        {p.total_steps > 0 && ` · ${pct}%`}
                      </p>
                    </div>
                    <span style={{ background: 'var(--badge-active-bg)', color: 'var(--badge-active-text)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                      active
                    </span>
                  </div>
                  {p.total_steps > 0 && (
                    <div style={{ height: 4, background: 'var(--border-light)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Focus mode shortcut */}
            <button onClick={handleFocusMode} style={{
              width: '100%', marginTop: 4,
              background: 'var(--primary)', border: 'none', color: 'var(--primary-text)',
              borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              🎯 Jump into Focus Mode
            </button>
          </>
        )}
      </div>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Nav cards ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Browse
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    borderRadius: 10, padding: '14px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    transition: 'background 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: col.bg, color: col.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {col.icon}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{card.label}</span>
                    </div>
                    {isWorkshop && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{workshopExpanded ? '▲' : '▼'}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{card.desc}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: col.text }}>{card.stat}</span>
                  </div>
                </div>

                {isWorkshop && workshopExpanded && (
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {WORKSHOP_ITEMS.map(item => (
                      <button key={item.path}
                        onClick={() => { if (!unlocked) { navigate('/settings'); return; } navigate(item.path); }}
                        style={{
                          background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                          borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                          color: 'var(--text-body)', fontSize: 13, fontWeight: 500, textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
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
      </div>

      {/* ── Recently viewed ───────────────────────────────────────── */}
      {recent.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
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
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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

      {/* ── Locked state ──────────────────────────────────────────── */}
      {!unlocked && (
        <div style={{ background: 'var(--bg-accent)', border: '1px solid var(--border-accent)', borderRadius: 12, padding: '16px 20px' }}>
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
