import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import ProjectDetail from '../components/ProjectDetail';

type Project = {
  id: string;
  name: string;
  status: string;
  current_row: number;
  target_rows: number | null;
  started_at: string | null;
};

type View = 'list' | 'detail' | 'new';

const statusClass: Record<string, string> = {
  active: 'badge-active', completed: 'badge-completed',
  paused: 'badge-paused', frogged: 'badge-frogged',
};

export default function ProjectsPage() {
  const { unlocked } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [targetRows, setTargetRows] = useState('');
  const [startedAt, setStartedAt] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('id, name, status, current_row, target_rows, started_at')
      .order('created_at', { ascending: false });
    if (data) setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => { if (view === 'list') fetchProjects(); }, [view, fetchProjects]);

  async function saveNew() {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('projects').insert({
      name: name.trim(),
      target_rows: targetRows ? parseInt(targetRows) : null,
      started_at: startedAt || null,
      notes: notes || null,
      status: 'active',
      current_row: 0,
    }).select().single();
    setSaving(false);
    if (error || !data) return;
    setSelectedId(data.id);
    setView('detail');
  }

  if (view === 'detail' && selectedId) {
    return (
      <ProjectDetail
        projectId={selectedId}
        onBack={() => setView('list')}
        readOnly={!unlocked}
      />
    );
  }

  if (view === 'new' && unlocked) {
    return (
      <div>
        <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 20 }}>← Back</button>
        <h1>New Project</h1>
        <div style={f.field}>
          <label style={f.label}>Project Name *</label>
          <input style={f.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Blue Cabled Sweater" />
        </div>
        <div style={f.field}>
          <label style={f.label}>Target Rows</label>
          <input style={f.input} value={targetRows} onChange={e => setTargetRows(e.target.value)} placeholder="e.g. 220" type="number" />
        </div>
        <div style={f.field}>
          <label style={f.label}>Start Date</label>
          <input style={f.input} value={startedAt} onChange={e => setStartedAt(e.target.value)} type="date" />
        </div>
        <div style={f.field}>
          <label style={f.label}>Notes</label>
          <textarea style={{ ...f.input, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
        </div>
        <button className="btn btn-primary" onClick={saveNew} disabled={saving || !name.trim()}
          style={{ marginTop: 16, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creating…' : 'Create Project'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Projects</h1>
        {unlocked && (
          <button className="btn btn-primary" onClick={() => setView('new')}>+ New Project</button>
        )}
      </div>
      {!unlocked && (
        <div style={{ background: '#1a2540', borderRadius: 10, padding: '10px 14px', marginBottom: 16, borderLeft: '3px solid #374151', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>🔒</span>
          <p style={{ color: '#6B7280', fontSize: 13 }}>
            View only. <a href="/settings" style={{ color: '#7C3AED', textDecoration: 'none' }}>Unlock</a> for full access.
          </p>
        </div>
      )}
      {loading ? <p style={{ color: '#9CA3AF' }}>Loading…</p> : projects.length === 0 ? (
        <p className="empty">No projects yet.</p>
      ) : (
        projects.map(p => (
          <div key={p.id} className="card" onClick={() => { setSelectedId(p.id); setView('detail'); }}>
            <div className="card-row">
              <span className="card-title">{p.name}</span>
              <span className={`badge ${statusClass[p.status] ?? ''}`}>{p.status}</span>
            </div>
            <p className="card-sub">Row {p.current_row}{p.target_rows ? ` of ${p.target_rows}` : ''}</p>
          </div>
        ))
      )}
    </div>
  );
}

const f = {
  field: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', color: '#9CA3AF', fontSize: 13, fontWeight: 500, marginBottom: 6 } as React.CSSProperties,
  input: {
    width: '100%', background: '#1F2937', border: '1px solid #374151',
    borderRadius: 8, padding: '10px 12px', color: '#F9FAFB', fontSize: 15,
    boxSizing: 'border-box',
  } as React.CSSProperties,
};
