import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ToolDetail from '../components/ToolDetail';

type Tool = { id: string; name: string; type: string | null; size: string | null; material: string | null; notes: string | null };
type View = 'list' | 'detail' | 'new';

const TOOL_TYPES = ['Needle', 'Circular Needle', 'DPN', 'Crochet Hook', 'Stitch Marker',
  'Row Counter', 'Cable Needle', 'Tapestry Needle', 'Blocking Mat', 'Other'];

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [size, setSize] = useState('');
  const [material, setMaterial] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { if (view === 'list') fetchTools(); }, [view]);

  async function fetchTools() {
    setLoading(true);
    const { data } = await supabase.from('tools')
      .select('id, name, type, size, material, notes')
      .order('type', { ascending: true });
    if (data) setTools(data);
    setLoading(false);
  }

  async function saveNew() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('tools').insert({
      name: name.trim(), type: type || null, size: size || null,
      material: material || null, notes: notes || null,
    });
    setSaving(false);
    setView('list');
  }

  if (view === 'detail' && selectedId) {
    return <ToolDetail toolId={selectedId} onBack={() => setView('list')} />;
  }

  if (view === 'new') {
    return (
      <div style={{ maxWidth: 600 }}>
        <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 20 }}>← Back</button>
        <h1>Add Tool</h1>

        <div style={f.field}>
          <label style={f.label}>Tool Name *</label>
          <input style={f.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Addi Turbo 4mm" />
        </div>

        <div style={f.field}>
          <label style={f.label}>Type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TOOL_TYPES.map(t => (
              <button key={t} onClick={() => setType(t)} className="btn"
                style={{ background: type === t ? 'var(--primary)' : 'var(--bg-input)', color: type === t ? 'var(--primary-text)' : 'var(--text-muted)', border: `1px solid ${type === t ? 'var(--primary)' : 'var(--border-medium)'}`, padding: '6px 12px', fontSize: 13 }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {[['Size', size, setSize, 'e.g. 4mm, US 6'], ['Material', material, setMaterial, 'e.g. Metal, Bamboo']].map(([label, value, setter, placeholder]) => (
          <div key={label as string} style={f.field}>
            <label style={f.label}>{label as string}</label>
            <input style={f.input} value={value as string}
              onChange={e => (setter as (v: string) => void)(e.target.value)}
              placeholder={placeholder as string} />
          </div>
        ))}

        <div style={f.field}>
          <label style={f.label}>Notes</label>
          <textarea style={{ ...f.input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
        </div>

        <button className="btn btn-primary" onClick={saveNew} disabled={saving || !name.trim()}
          style={{ marginTop: 8, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Add Tool'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Tools</h1>
        <button className="btn btn-primary" onClick={() => setView('new')}>+ Add Tool</button>
      </div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search tools…"
        style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-body)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
      />
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : tools.length === 0 ? (
        <p className="empty">No tools yet.</p>
      ) : (
        tools.filter(t =>
          !search.trim() ||
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          (t.type ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (t.size ?? '').toLowerCase().includes(search.toLowerCase())
        ).map(t => (
          <div key={t.id} className="card" onClick={() => { setSelectedId(t.id); setView('detail'); }}>
            <p className="card-title">{t.name}</p>
            <p className="card-sub">{[t.type, t.size, t.material].filter(Boolean).join(' · ')}</p>
          </div>
        ))
      )}
    </div>
  );
}

const f = {
  field: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 6 } as React.CSSProperties,
  input: {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)',
    borderRadius: 8, padding: '10px 12px', color: 'var(--text-body)', fontSize: 15,
    boxSizing: 'border-box',
  } as React.CSSProperties,
};
