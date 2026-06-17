import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { inputStyle, labelStyle, selectStyle } from '../lib/theme';

type Tool = {
  id: string;
  name: string;
  type: string | null;
  size: string | null;
  material: string | null;
  notes: string | null;
  checked_out_project_id: string | null;
  checked_out_at: string | null;
};

type Project = { id: string; name: string; status: string };

type Props = { toolId: string; onBack: () => void };

const TOOL_TYPES = ['Needle', 'Circular Needle', 'DPN', 'Crochet Hook', 'Stitch Marker',
  'Row Counter', 'Cable Needle', 'Tapestry Needle', 'Blocking Mat', 'Other'];

export default function ToolDetail({ toolId, onBack }: Props) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [size, setSize] = useState('');
  const [material, setMaterial] = useState('');
  const [notes, setNotes] = useState('');

  // Checkout state
  const [projects, setProjects] = useState<Project[]>([]);
  const [checkoutProjectId, setCheckoutProjectId] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkedOutProject, setCheckedOutProject] = useState<Project | null>(null);

  useEffect(() => {
    supabase.from('tools').select('*').eq('id', toolId).single()
      .then(({ data }) => {
        if (data) {
          setTool(data);
          setName(data.name);
          setType(data.type ?? '');
          setSize(data.size ?? '');
          setMaterial(data.material ?? '');
          setNotes(data.notes ?? '');
        }
        setLoading(false);
      });

    supabase.from('projects')
      .select('id, name, status')
      .in('status', ['active', 'paused'])
      .order('name')
      .then(({ data }) => { if (data) setProjects(data); });
  }, [toolId]);

  // Resolve the checked-out project name once tool + projects are loaded
  useEffect(() => {
    if (!tool?.checked_out_project_id || projects.length === 0) { setCheckedOutProject(null); return; }
    const found = projects.find(p => p.id === tool.checked_out_project_id) ?? null;
    // Project might be completed/frogged and not in the active list — fetch it directly
    if (!found) {
      supabase.from('projects').select('id, name, status').eq('id', tool.checked_out_project_id).single()
        .then(({ data }) => setCheckedOutProject(data ?? null));
    } else {
      setCheckedOutProject(found);
    }
  }, [tool, projects]);

  async function save() {
    await supabase.from('tools').update({
      name: name.trim() || tool?.name,
      type: type || null,
      size: size || null,
      material: material || null,
      notes: notes || null,
    }).eq('id', toolId);
  }

  async function saveType(t: string) {
    setType(t);
    await supabase.from('tools').update({ type: t }).eq('id', toolId);
  }

  async function checkout() {
    if (!checkoutProjectId) return;
    setCheckingOut(true);
    const { error } = await supabase.from('tools').update({
      checked_out_project_id: checkoutProjectId,
      checked_out_at: new Date().toISOString(),
    }).eq('id', toolId);
    if (!error) {
      const project = projects.find(p => p.id === checkoutProjectId) ?? null;
      setCheckedOutProject(project);
      setTool(prev => prev ? { ...prev, checked_out_project_id: checkoutProjectId, checked_out_at: new Date().toISOString() } : prev);
      setCheckoutProjectId('');
    }
    setCheckingOut(false);
  }

  async function checkin() {
    const { error } = await supabase.from('tools').update({
      checked_out_project_id: null,
      checked_out_at: null,
    }).eq('id', toolId);
    if (!error) {
      setCheckedOutProject(null);
      setTool(prev => prev ? { ...prev, checked_out_project_id: null, checked_out_at: null } : prev);
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (!tool) return <p style={{ color: 'var(--text-muted)' }}>Not found.</p>;

  return (
    <div style={{ maxWidth: 600 }}>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 20 }}>← Back</button>

      {/* Inline-editable name */}
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={save}
        style={{
          background: 'none', border: 'none', color: 'var(--text-primary)',
          fontSize: 24, fontWeight: 700, padding: 0, fontFamily: 'inherit',
          outline: 'none', width: '100%', display: 'block', marginBottom: 24,
        }}
        placeholder="Tool name"
      />

      {/* Details card */}
      <div className="card" style={{ cursor: 'default', marginBottom: 12 }}>
        <p className="card-title" style={{ marginBottom: 16 }}>Details</p>

        <Field label="Type">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TOOL_TYPES.map(t => (
              <button key={t} onClick={() => saveType(t)} style={{
                padding: '5px 12px', borderRadius: 16, border: '1px solid',
                borderColor: type === t ? 'var(--primary)' : 'var(--border-medium)',
                background: type === t ? 'var(--primary)' : 'transparent',
                color: type === t ? 'var(--primary-text)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 13,
              }}>{t}</button>
            ))}
          </div>
        </Field>

        <Field label="Size">
          <input style={inputStyle} value={size} onChange={e => setSize(e.target.value)}
            onBlur={save} placeholder="e.g. 4mm, US 6" />
        </Field>

        <Field label="Material">
          <input style={inputStyle} value={material} onChange={e => setMaterial(e.target.value)}
            onBlur={save} placeholder="e.g. Metal, Bamboo, Carbon Fibre" />
        </Field>

        <Field label="Notes">
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} onBlur={save}
            placeholder="Any notes…" />
        </Field>
      </div>

      {/* Checkout card */}
      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <p className="card-title" style={{ marginBottom: 12 }}>
          Checked Out To
        </p>

        {checkedOutProject ? (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--bg-accent)', borderRadius: 8, padding: '10px 14px',
              border: '1px solid var(--border-accent)', marginBottom: 10,
            }}>
              <div>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  {checkedOutProject.name}
                </p>
                {tool.checked_out_at && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                    Since {new Date(tool.checked_out_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                background: checkedOutProject.status === 'active' ? '#d4edda' : '#fdecc8',
                color: checkedOutProject.status === 'active' ? '#2d6a4f' : '#92600a',
              }}>
                {checkedOutProject.status}
              </span>
            </div>
            <button className="btn btn-secondary" onClick={checkin} style={{ fontSize: 13 }}>
              ✓ Check In
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              Not checked out. Assign this tool to an active project.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={checkoutProjectId}
                onChange={e => setCheckoutProjectId(e.target.value)}
                style={{ ...selectStyle, flex: 1 }}
              >
                <option value="">Pick a project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={checkout}
                disabled={!checkoutProjectId || checkingOut}
                style={{ whiteSpace: 'nowrap', opacity: !checkoutProjectId || checkingOut ? 0.5 : 1 }}
              >
                Check Out
              </button>
            </div>
            {projects.length === 0 && (
              <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 8 }}>
                No active or paused projects found.
              </p>
            )}
          </div>
        )}
      </div>

      <button onClick={async () => {
        if (!confirm('Delete this tool?')) return;
        await supabase.from('tools').delete().eq('id', toolId);
        onBack();
      }} style={{
        marginTop: 4, width: '100%', padding: 12, borderRadius: 10,
        border: '1px solid var(--danger, #dc2626)',
        background: 'transparent', color: 'var(--danger, #dc2626)',
        cursor: 'pointer', fontSize: 14,
      }}>
        Delete Tool
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
