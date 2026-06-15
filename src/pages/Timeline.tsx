import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
};

type Project = {
  id: string;
  name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  sessions: Session[];
};

const STATUS_COLORS: Record<string, string> = {
  active: '#10B981',
  paused: '#F59E0B',
  completed: '#7C3AED',
  frogged: '#EF4444',
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function parseDate(s: string): Date {
  return new Date(s);
}

export default function TimelinePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [view, setView] = useState<'timeline' | 'stats'>('timeline');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, name, status, started_at, completed_at')
      .order('started_at', { ascending: true });

    if (!projectData) { setLoading(false); return; }

    const { data: sessionData } = await supabase
      .from('knitting_sessions')
      .select('id, project_id, started_at, ended_at, duration_minutes')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: true });

    const sessionsByProject = (sessionData ?? []).reduce<Record<string, Session[]>>((acc, s) => {
      if (!acc[s.project_id]) acc[s.project_id] = [];
      acc[s.project_id].push(s);
      return acc;
    }, {});

    setProjects(projectData.map(p => ({
      ...p,
      sessions: sessionsByProject[p.id] ?? [],
    })));
    setLoading(false);
  }

  // Date range for timeline
  const allDates = projects.flatMap(p => [
    p.started_at ? new Date(p.started_at) : null,
    p.completed_at ? new Date(p.completed_at) : null,
    ...p.sessions.map(s => new Date(s.started_at)),
  ]).filter((d): d is Date => d !== null);

  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date();
  const maxDate = new Date(); // always extend to today
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));

  function dayOffset(dateStr: string): number {
    const d = parseDate(dateStr);
    return Math.max(0, Math.floor((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function pct(days: number): string {
    return `${(days / totalDays) * 100}%`;
  }

  // Stats
  const totalSessionMinutes = projects.reduce((sum, p) =>
    sum + p.sessions.reduce((s2, s) => s2 + (s.duration_minutes ?? 0), 0), 0);
  const totalSessions = projects.reduce((sum, p) => sum + p.sessions.length, 0);
  const completedProjects = projects.filter(p => p.status === 'completed').length;

  const projectStats = projects.map(p => ({
    ...p,
    totalMinutes: p.sessions.reduce((s, sess) => s + (sess.duration_minutes ?? 0), 0),
    sessionCount: p.sessions.length,
  })).sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Month labels for timeline
  const monthLabels: { label: string; pct: string }[] = [];
  const cur = new Date(minDate);
  cur.setDate(1);
  while (cur <= maxDate) {
    const offset = Math.floor((cur.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    monthLabels.push({
      label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }),
      pct: pct(offset),
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  if (loading) return <p style={{ color: '#9CA3AF' }}>Loading…</p>;

  if (projects.length === 0) {
    return (
      <div>
        <h1>Timeline</h1>
        <p className="empty">No projects yet — start a project to see your timeline.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Timeline</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['timeline', 'stats'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid',
              borderColor: view === v ? '#7C3AED' : '#374151',
              background: view === v ? '#7C3AED' : 'transparent',
              color: view === v ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>{v === 'timeline' ? '📅 Timeline' : '📊 Stats'}</button>
          ))}
        </div>
      </div>

      {view === 'timeline' ? (
        <>
          {/* Summary strip */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              ['Projects', projects.length, '#A78BFA'],
              ['Completed', completedProjects, '#10B981'],
              ['Sessions', totalSessions, '#F59E0B'],
              ['Time knitted', formatDuration(totalSessionMinutes), '#7C3AED'],
            ].map(([label, value, color]) => (
              <div key={label as string} style={{ background: '#1F2937', borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 120 }}>
                <p style={{ color: color as string, fontSize: 22, fontWeight: 700 }}>{value}</p>
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ background: '#1F2937', borderRadius: 16, padding: 24, overflowX: 'auto' }}>
            {/* Month labels */}
            <div style={{ position: 'relative', height: 24, marginLeft: 180, marginBottom: 8, minWidth: 600 }}>
              {monthLabels.map((m, i) => (
                <span key={i} style={{
                  position: 'absolute', left: m.pct, transform: 'translateX(-50%)',
                  color: '#4B5563', fontSize: 11, whiteSpace: 'nowrap',
                }}>{m.label}</span>
              ))}
            </div>

            {/* Project rows */}
            <div style={{ minWidth: 600 }}>
              {projects.map(p => {
                const start = p.started_at ? dayOffset(p.started_at) : 0;
                const end = p.completed_at
                  ? dayOffset(p.completed_at)
                  : Math.floor((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
                const barWidth = Math.max(0.5, end - start);
                const color = STATUS_COLORS[p.status] ?? '#6B7280';
                const totalMins = p.sessions.reduce((s, sess) => s + (sess.duration_minutes ?? 0), 0);
                const isSelected = selectedProject === p.id;

                return (
                  <div key={p.id}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', marginBottom: 4, cursor: 'pointer' }}
                      onClick={() => setSelectedProject(isSelected ? null : p.id)}
                    >
                      {/* Project label */}
                      <div style={{ width: 180, flexShrink: 0, paddingRight: 12 }}>
                        <p style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                        <p style={{ color: '#6B7280', fontSize: 11 }}>{totalMins > 0 ? formatDuration(totalMins) : 'no sessions'}</p>
                      </div>

                      {/* Bar track */}
                      <div style={{ flex: 1, position: 'relative', height: 28, background: '#374151', borderRadius: 6 }}>
                        {/* Main bar */}
                        <div style={{
                          position: 'absolute',
                          left: pct(start), width: pct(barWidth),
                          top: 0, bottom: 0,
                          background: color + '44',
                          borderRadius: 6,
                          border: `1px solid ${color}66`,
                        }} />
                        {/* Session dots */}
                        {p.sessions.map(s => (
                          <div key={s.id} style={{
                            position: 'absolute',
                            left: pct(dayOffset(s.started_at)),
                            top: '50%', transform: 'translate(-50%, -50%)',
                            width: 8, height: 8,
                            borderRadius: 4,
                            background: color,
                            opacity: 0.9,
                          }} title={`${new Date(s.started_at).toLocaleDateString()} — ${s.duration_minutes ? formatDuration(s.duration_minutes) : '?'}`} />
                        ))}
                        {/* Status badge */}
                        <div style={{
                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                          background: color + '22', color, borderRadius: 4,
                          padding: '1px 6px', fontSize: 10, fontWeight: 600,
                        }}>{p.status}</div>
                      </div>
                    </div>

                    {/* Expanded session list */}
                    {isSelected && p.sessions.length > 0 && (
                      <div style={{ marginLeft: 180, marginBottom: 8, background: '#111827', borderRadius: 8, padding: 12 }}>
                        <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Sessions</p>
                        {p.sessions.map(s => (
                          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #1F2937' }}>
                            <span style={{ color: '#D1D5DB', fontSize: 13 }}>
                              {new Date(s.started_at).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span style={{ color: STATUS_COLORS[p.status] ?? '#A78BFA', fontSize: 13, fontWeight: 600 }}>
                              {s.duration_minutes ? formatDuration(s.duration_minutes) : '—'}
                            </span>
                          </div>
                        ))}
                        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>
                          Total: {formatDuration(p.sessions.reduce((s, sess) => s + (sess.duration_minutes ?? 0), 0))} across {p.sessions.length} session{p.sessions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                    {isSelected && p.sessions.length === 0 && (
                      <div style={{ marginLeft: 180, marginBottom: 8, padding: '8px 12px' }}>
                        <p style={{ color: '#4B5563', fontSize: 13 }}>No timed sessions recorded for this project.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid #374151', flexWrap: 'wrap' }}>
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
                  <span style={{ color: '#6B7280', fontSize: 12 }}>{status}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: '#7C3AED' }} />
                <span style={{ color: '#6B7280', fontSize: 12 }}>session dot</span>
              </div>
              <span style={{ color: '#4B5563', fontSize: 12, marginLeft: 'auto' }}>Click a row to expand sessions</span>
            </div>
          </div>
        </>
      ) : (
        /* Stats view */
        <>
          {/* Overall stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              ['Total projects', projects.length, '#A78BFA'],
              ['Completed', completedProjects, '#10B981'],
              ['Active', projects.filter(p => p.status === 'active').length, '#F59E0B'],
              ['Frogged', projects.filter(p => p.status === 'frogged').length, '#EF4444'],
              ['Total sessions', totalSessions, '#7C3AED'],
              ['Total time', formatDuration(totalSessionMinutes), '#7C3AED'],
              ['Avg session', totalSessions > 0 ? formatDuration(totalSessionMinutes / totalSessions) : '—', '#9CA3AF'],
            ].map(([label, value, color]) => (
              <div key={label as string} style={{ background: '#1F2937', borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ color: color as string, fontSize: 24, fontWeight: 700 }}>{value}</p>
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Per-project breakdown */}
          <div style={{ background: '#1F2937', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', padding: '10px 16px', background: '#374151' }}>
              {['Project', 'Sessions', 'Time', 'Status'].map(h => (
                <span key={h} style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {projectStats.map((p, i) => (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px',
                padding: '12px 16px', borderTop: i > 0 ? '1px solid #374151' : 'none',
                background: i % 2 === 0 ? 'transparent' : '#1a1f2e',
              }}>
                <span style={{ color: '#F9FAFB', fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#9CA3AF', fontSize: 14 }}>{p.sessionCount}</span>
                <span style={{ color: '#A78BFA', fontSize: 14, fontWeight: 600 }}>
                  {p.totalMinutes > 0 ? formatDuration(p.totalMinutes) : '—'}
                </span>
                <span style={{ color: STATUS_COLORS[p.status] ?? '#6B7280', fontSize: 12, fontWeight: 600 }}>{p.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
