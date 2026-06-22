import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import ProjectDetail from '../components/ProjectDetail';
import { inputStyle, labelStyle } from '../lib/theme';
import { recordRecentItem } from './Dashboard';
import { FOCUS_SIGNAL_KEY } from './Dashboard';

type Project = {
  id: string;
  name: string;
  status: string;
  current_row: number;
  started_at: string | null;
  total_steps: number;
  pattern_name: string | null;
  yarn_weight: string | null;
  category: string | null;
  photo_url: string | null;
};

type GalleryProject = {
  id: string;
  name: string;
  completed_at: string | null;
  rating: number | null;
  completion_notes: string | null;
  photo_url: string | null;
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

type View = 'list' | 'detail' | 'new' | 'gallery';

const CATEGORY_COLORS: Record<string, { bg: string; label: string }> = {
  'Hats':  { bg: 'linear-gradient(160deg, #b8a8d8, #9888c0)', label: 'Hats' },
  'Body':  { bg: 'linear-gradient(160deg, #9ab0c8, #7890a8)', label: 'Body' },
  'Feet':  { bg: 'linear-gradient(160deg, #c8a0b8, #a880a0)', label: 'Feet' },
  'Bags':  { bg: 'linear-gradient(160deg, #c8a878, #b08858)', label: 'Bags' },
  'Misc':  { bg: 'linear-gradient(160deg, #98b8a8, #789888)', label: 'Misc' },
};
const DEFAULT_SWATCH = 'linear-gradient(160deg, #b8a8b8, #9888a0)';

const statusBadge: Record<string, { bg: string; color: string }> = {
  active:    { bg: 'var(--badge-active-bg)',    color: 'var(--badge-active-text)' },
  paused:    { bg: 'var(--badge-paused-bg)',    color: 'var(--badge-paused-text)' },
  completed: { bg: 'var(--badge-completed-bg)', color: 'var(--badge-completed-text)' },
  frogged:   { bg: 'var(--badge-frogged-bg)',   color: 'var(--badge-frogged-text)' },
};

const statusClass: Record<string, string> = {
  active: 'badge-active', completed: 'badge-completed',
  paused: 'badge-paused', frogged: 'badge-frogged',
};

const UNITS = ['g', 'oz', 'yards', 'meters', 'skeins'];

export default function ProjectsPage() {
  const { unlocked } = useAuth();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [startedAt, setStartedAt] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Yarn selection
  const [stashYarns, setStashYarns] = useState<StashYarn[]>([]);
  const [selectedYarns, setSelectedYarns] = useState<SelectedYarn[]>([
    { catalogId: '', stashId: null, name: '', colorHex: null, quantity: '', unit: 'yards', role: 'MC' },
  ]);
  const [showYarnPicker, setShowYarnPicker] = useState(false);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const [yarnSearch, setYarnSearch] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Gallery
  const [gallery, setGallery] = useState<GalleryProject[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('id, name, status, current_row, started_at, pattern:patterns(name, yarn_weight, category, parsed_guide)')
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // For each project get the first photo signed URL and compute total steps
    const enriched = await Promise.all(data.map(async p => {
      const pat = p.pattern as { name?: string; yarn_weight?: string; category?: string; parsed_guide?: { sections?: Array<{ steps?: string[] }> } } | null;
      const sections = pat?.parsed_guide?.sections ?? [];
      const total_steps = sections.reduce((s: number, sec: { steps?: string[] }) => s + (sec.steps?.length ?? 0), 0);

      const { data: photos } = await supabase
        .from('project_photos').select('storage_path')
        .eq('project_id', p.id).order('created_at', { ascending: true }).limit(1);
      let photo_url: string | null = null;
      if (photos?.[0]) {
        const { data: signed } = await supabase.storage
          .from('project-photos').createSignedUrl(photos[0].storage_path, 3600);
        photo_url = signed?.signedUrl ?? null;
      }

      return {
        id: p.id, name: p.name, status: p.status,
        current_row: p.current_row, started_at: p.started_at,
        total_steps,
        pattern_name: pat?.name ?? null,
        yarn_weight: pat?.yarn_weight ?? null,
        category: pat?.category ?? null,
        photo_url,
      };
    }));

    setProjects(enriched);
    setLoading(false);
  }, []);

  async function fetchGallery() {
    setGalleryLoading(true);
    const { data: completed } = await supabase
      .from('projects')
      .select('id, name, completed_at, rating, completion_notes')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (!completed) { setGalleryLoading(false); return; }

    const withPhotos = await Promise.all(
      completed.map(async p => {
        const { data: photos } = await supabase
          .from('project_photos')
          .select('storage_path')
          .eq('project_id', p.id)
          .order('created_at', { ascending: true })
          .limit(1);
        let photo_url: string | null = null;
        if (photos && photos[0]) {
          const { data: signed } = await supabase.storage
            .from('project-photos')
            .createSignedUrl(photos[0].storage_path, 3600);
          photo_url = signed?.signedUrl ?? null;
        }
        return { ...p, photo_url };
      })
    );

    setGallery(withPhotos);
    setGalleryLoading(false);
  }

  useEffect(() => { if (view === 'list') fetchProjects(); }, [view, fetchProjects]);
  useEffect(() => { if (view === 'gallery') fetchGallery(); }, [view]);

  // Open a specific project directly from dashboard card click
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) { setSelectedId(openId); setView('detail'); }
  }, [searchParams]);

  // Focus mode signal from dashboard shortcut
  useEffect(() => {
    const targetId = sessionStorage.getItem(FOCUS_SIGNAL_KEY);
    if (targetId) {
      sessionStorage.removeItem(FOCUS_SIGNAL_KEY);
      sessionStorage.setItem('loophole_open_focus', targetId);
      setSelectedId(targetId);
      setView('detail');
    }
  }, []);

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
      ...y, catalogId: yarn.id, stashId: stashEntry?.id ?? null,
      name: yarn.name, colorHex: yarn.color_hex, unit: stashEntry?.unit ?? 'yards',
    } : y));
    setShowYarnPicker(false);
    setPickingIndex(null);
    setYarnSearch('');
  }

  async function saveNew() {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('projects').insert({
      name: name.trim(), started_at: startedAt || null,
      notes: notes || null, status: 'active', current_row: 0,
    }).select().single();
    if (error || !data) { setSaving(false); return; }

    const yarnsToLink = selectedYarns.filter(y => y.stashId);
    if (yarnsToLink.length > 0) {
      await supabase.from('project_yarn').insert(
        yarnsToLink.map(y => ({
          project_id: data.id, yarn_stash_id: y.stashId, yarn_name: y.name,
          quantity_used: y.quantity ? parseFloat(y.quantity) : null, unit: y.unit,
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
        (y.brand ?? '').toLowerCase().includes(yarnSearch.toLowerCase()))
    : stashYarns;

  const filteredProjects = projects.filter(p => {
    const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Views ──────────────────────────────────────────────────────────────────

  if (view === 'detail' && selectedId) {
    return (
      <ProjectDetail
        projectId={selectedId}
        onBack={() => setView('list')}
        readOnly={!unlocked}
      />
    );
  }

  if (view === 'gallery') {
    return (
      <div>
        <div className="page-header">
          <h1>Finished Projects</h1>
          <button onClick={() => setView('list')} className="btn btn-secondary">← All projects</button>
        </div>
        {galleryLoading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Loading gallery…</p>
        ) : gallery.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🧶</p>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>No finished projects yet</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Mark a project as completed and it will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {gallery.map(p => (
              <div key={p.id}
                onClick={() => { setSelectedId(p.id); setView('detail'); }}
                style={{
                  borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                  background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  transition: 'transform 0.15s, box-shadow 0.15s', position: 'relative',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ width: '100%', aspectRatio: '4/3', background: 'var(--bg-muted)', position: 'relative', overflow: 'hidden' }}>
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🧶</div>
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 14px' }}>
                    <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 3, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{p.name}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {p.completed_at && (
                        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
                          {new Date(p.completed_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                        </p>
                      )}
                      {p.rating && <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{'⭐'.repeat(p.rating)}</p>}
                    </div>
                  </div>
                </div>
                {!p.photo_url && p.completion_notes && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-light)' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {p.completion_notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
          <label style={f.label}>Start Date</label>
          <input style={f.input} value={startedAt} onChange={e => setStartedAt(e.target.value)} type="date" />
        </div>
        <div style={f.field}>
          <label style={f.label}>Notes</label>
          <textarea style={{ ...f.input, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
        </div>
        <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Yarn from Stash (optional)
        </p>
        {selectedYarns.map((yarn, index) => (
          <div key={index} style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 14, marginBottom: 10, border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <input value={yarn.role}
                onChange={e => setSelectedYarns(prev => prev.map((y, i) => i === index ? { ...y, role: e.target.value } : y))}
                placeholder="MC / CC1…"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-body)', fontSize: 13, width: 100 }} />
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
                <input value={yarn.quantity}
                  onChange={e => setSelectedYarns(prev => prev.map((y, i) => i === index ? { ...y, quantity: e.target.value } : y))}
                  placeholder="Qty used" type="number" style={{ ...f.input, width: 100 }} />
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
        <button className="btn btn-primary" onClick={saveNew} disabled={saving || !name.trim()} style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creating…' : 'Create Project'}
        </button>
        {showYarnPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>Pick a Yarn</p>
                <button onClick={() => { setShowYarnPicker(false); setPickingIndex(null); setYarnSearch(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <input value={yarnSearch} onChange={e => setYarnSearch(e.target.value)} placeholder="Search…" style={{ ...f.input, marginBottom: 12 }} />
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
                        <span style={{ color: inStock ? 'var(--success-vivid)' : 'var(--danger-vivid)', fontSize: 13 }}>
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

  // ── List view (default) ────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1>Projects</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('gallery')} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-medium)',
            color: 'var(--text-muted)', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
          }}>🖼 Gallery</button>
          {unlocked && (
            <button className="btn btn-primary" onClick={() => setView('new')}>+ New Project</button>
          )}
        </div>
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
          style={{ flex: 1, minWidth: 200, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-body)', fontSize: 14 }} />
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

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : filteredProjects.length === 0 ? (
        <p className="empty">{search || statusFilter !== 'all' ? 'No matching projects.' : 'No projects yet.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredProjects.map(p => {
            const pct = p.total_steps > 0 ? Math.round((p.current_row / p.total_steps) * 100) : 0;
            const swatch = CATEGORY_COLORS[p.category ?? ''] ?? { bg: DEFAULT_SWATCH, label: p.category ?? '' };
            const badge = statusBadge[p.status] ?? { bg: 'var(--bg-muted)', color: 'var(--text-muted)' };
            return (
              <div key={p.id}
                onClick={() => {
                  setSelectedId(p.id);
                  setView('detail');
                  recordRecentItem({
                    id: p.id, name: p.name, type: 'project',
                    meta: `${p.status} · ${p.current_row} step${p.current_row === 1 ? '' : 's'}`,
                    path: '/projects', color: '#7F77DD',
                  });
                }}
                style={{
                  display: 'grid', gridTemplateColumns: '88px 1fr',
                  background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Colour swatch sidebar */}
                <div style={{
                  background: p.photo_url ? 'var(--bg-muted)' : swatch.bg,
                  position: 'relative', overflow: 'hidden',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  paddingBottom: 8,
                }}>
                  {p.photo_url && (
                    <img src={p.photo_url} alt={p.name}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {p.category && (
                    <span style={{
                      position: 'relative', zIndex: 1,
                      background: 'rgba(0,0,0,0.35)', color: '#fff',
                      fontSize: 9, fontWeight: 600, padding: '2px 6px',
                      borderRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>{p.category}</span>
                  )}
                </div>

                {/* Content */}
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.pattern_name && p.pattern_name !== p.name ? p.pattern_name : (p.yarn_weight ?? '—')}
                      </p>
                    </div>
                    <span style={{ background: badge.bg, color: badge.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {p.status}
                    </span>
                  </div>

                  <div>
                    {p.total_steps > 0 ? (
                      <>
                        <div style={{ height: 3, background: 'var(--border-light)', borderRadius: 2, marginBottom: 4 }}>
                          <div className="progress-bar-fill" style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 2 }} />
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {p.current_row === 0 ? `Not started · ${p.total_steps} steps` : `${p.current_row} of ${p.total_steps} steps · ${pct}%`}
                        </p>
                      </>
                    ) : (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        {p.current_row === 0 ? 'Not started' : `${p.current_row} steps completed`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const f = {
  field: { marginBottom: 16 } as React.CSSProperties,
  label: labelStyle,
  input: inputStyle,
};
