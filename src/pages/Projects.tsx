import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import ProjectDetail from '../components/ProjectDetail';
import { inputStyle, labelStyle } from '../lib/theme';

type Project = {
  id: string;
  name: string;
  status: string;
  current_row: number;
  target_rows: number | null;
  started_at: string | null;
};

type StashYarn = {
  id: string;
  name: string;
  brand: string | null;
  color_hex: string | null;
  stash: Array<{ id: string; quantity: number | null; unit: string; status: string }>;
};

type SelectedYarn = {
  catalogId: string;
  stashId: string | null;
  name: string;
  colorHex: string | null;
  quantity: string;
  unit: string;
  role: string;
};

type View = 'list' | 'detail' | 'new';

const statusClass: Record<string, string> = {
  active: 'badge-active', completed: 'badge-completed',
  paused: 'badge-paused', frogged: 'badge-frogged',
};

const UNITS = ['g', 'oz', 'yards', 'meters', 'skeins'];

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

  // Yarn selection
  const [stashYarns, setStashYarns] = useState<StashYarn[]>([]);
  const [selectedYarns, setSelectedYarns] = useState<SelectedYarn[]>([
    { catalogId: '', stashId: null, name: '', colorHex: null, quantity: '', unit: 'yards', role: 'MC' }
  ]);
  const [showYarnPicker, setShowYarnPicker] = useState(false);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const [yarnSearch, setYarnSearch] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  useEffect(() => {
    if (view === 'new') {
      supabase.from('yarn_catalog')
        .select('id, name, brand, color_hex, stash:yarn_stash(id, quantity, unit, status)')
        .order('name', { ascending: true })
        .then(({ data }) => { if (data) setStashYarns(data); });
    }
  }, [view]);

  function pickYarn(yarn: StashYarn) {
    if (pickingIndex === null) return;
    const inStock = yarn.stash?.find(s => s.status === 'in_stock');
    const stashEntry = inStock ?? yarn.stash?.[0];
    setSelectedYarns(prev => prev.map((y, i) => i === pickingIndex ? {
      ...y,
      catalogId: yarn.id,
      stashId: stashEntry?.id ?? null,
      name: yarn.name,
      colorHex: yarn.color_hex,
      unit: stashEntry?.unit ?? 'yards',
    } : y));
    setShowYarnPicker(false);
    setPickingIndex(null);
    setYarnSearch('');
  }

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
    if (error || !data) { setSaving(false); return; }

    // Link yarns
    const yarnsToLink = selectedYarns.filter(y => y.stashId);
    if (yarnsToLink.length > 0) {
      await supabase.from('project_yarn').insert(
        yarnsToLink.map(y => ({
          project_id: data.id,
          yarn_stash_id: y.stashId,
          yarn_name: y.name,
          quantity_used: y.quantity ? parseFloat(y.quantity) : null,
          unit: y.unit,
        }))
      );
    }

    setSaving(false);
    setSelectedId(data.id);
    setView('detail');
  }

  const filteredYarns = yarnSearch.trim()
    ? stashYarns.filter(y =>
        y.name.toLowerCase().includes(yarnSearch.toLowerCase()) ||
        (y.brand ?? '').toLowerCase().includes(yarnSearch.toLowerCase())
      )
    : stashYarns;

  const filteredProjects = projects.filter(p => {
    const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

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
      <div style={{ maxWidth: 700 }}>
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

        {/* Yarn selection */}
        <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Yarn from Stash (optional)
        </p>

        {selectedYarns.map((yarn, index) => (
          <div key={index} style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 14, marginBottom: 10, border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <input
                value={yarn.role}
                onChange={e => setSelectedYarns(prev => prev.map((y, i) => i === index ? { ...y, role: e.target.value } : y))}
                placeholder="MC / CC1…"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-body)', fontSize: 13, width: 100 }}
              />
              {selectedYarns.length > 1 && (
                <button onClick={() => setSelectedYarns(prev => prev.filter((_, i) => i !== index))}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              )}
            </div>

            {yarn.name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-accent)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: yarn.colorHex ?? 'var(--text-faint)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, flex: 1 }}>{yarn.name}</span>
                <button onClick={() => { setPickingIndex(index); setShowYarnPicker(true); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13 }}>Change</button>
              </div>
            ) : (
              <button onClick={() => { setPickingIndex(index); setShowYarnPicker(true); }}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px dashed var(--border-medium)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 14, marginBottom: 10 }}>
                + Pick from stash
              </button>
            )}

            {yarn.name && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={yarn.quantity}
                  onChange={e => setSelectedYarns(prev => prev.map((y, i) => i === index ? { ...y, quantity: e.target.value } : y))}
                  placeholder="Qty used"
                  type="number"
                  style={{ ...f.input, width: 100 }}
                />
                {UNITS.map(u => (
                  <button key={u} onClick={() => setSelectedYarns(prev => prev.map((y, i) => i === index ? { ...y, unit: u } : y))}
                    style={{ padding: '6px 10px', borderRadius: 16, border: '1px solid', borderColor: yarn.unit === u ? 'var(--primary)' : 'var(--border-medium)', background: yarn.unit === u ? 'var(--primary)' : 'transparent', color: yarn.unit === u ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                    {u}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <button onClick={() => setSelectedYarns(prev => [...prev, { catalogId: '', stashId: null, name: '', colorHex: null, quantity: '', unit: 'yards', role: `CC${prev.length}` }])}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-medium)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 24 }}>
          + Add another yarn
        </button>

        <button className="btn btn-primary" onClick={saveNew} disabled={saving || !name.trim()}
          style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creating…' : 'Create Project'}
        </button>

        {/* Yarn picker modal */}
        {showYarnPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>Pick a Yarn</p>
                <button onClick={() => { setShowYarnPicker(false); setPickingIndex(null); setYarnSearch(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <input value={yarnSearch} onChange={e => setYarnSearch(e.target.value)}
                placeholder="Search…"
                style={{ ...f.input, marginBottom: 12 }} />
              <div style={{ overflow: 'auto', flex: 1 }}>
                {filteredYarns.map(y => {
                  const inStock = y.stash?.find(s => s.status === 'in_stock');
                  const qty = inStock?.quantity ?? y.stash?.[0]?.quantity;
                  const unit = inStock?.unit ?? y.stash?.[0]?.unit ?? 'g';
                  return (
                    <div key={y.id} onClick={() => pickYarn(y)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, background: y.color_hex ?? 'var(--text-faint)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{y.name}</p>
                        {y.brand && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{y.brand}</p>}
                      </div>
                      {qty != null && (
                        <span style={{ color: inStock ? '#10B981' : '#EF4444', fontSize: 13 }}>
                          {qty} {unit}{!inStock ? ' (out)' : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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
      <div style={{ background: 'var(--bg-accent)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, borderLeft: '3px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>🔒</span>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          View only. <a href="/settings" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Unlock</a> for full access.
        </p>
      </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects…"
          style={{ flex: 1, minWidth: 200, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-body)', fontSize: 14 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'active', 'paused', 'completed', 'frogged'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '6px 12px', borderRadius: 16, border: '1px solid',
              borderColor: statusFilter === s ? 'var(--primary)' : 'var(--border-medium)',
              background: statusFilter === s ? 'var(--primary)' : 'transparent',
              color: statusFilter === s ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
            }}>{s}</button>
          ))}
        </div>
      </div>
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : filteredProjects.length === 0 ? (
        <p className="empty">{search || statusFilter !== 'all' ? 'No matching projects.' : 'No projects yet.'}</p>
      ) : (
        filteredProjects.map(p => (
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
  label: labelStyle,
  input: inputStyle,
};
