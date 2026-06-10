import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Tool = {
  id: string;
  name: string;
  type: string | null;
  size: string | null;
  material: string | null;
  notes: string | null;
};

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

  useEffect(() => {
    supabase.from('tools').select('*').eq('id', toolId).single()
      .then(({ data }) => {
        if (data) {
          setTool(data);
          setName(data.name); setType(data.type ?? '');
          setSize(data.size ?? ''); setMaterial(data.material ?? '');
          setNotes(data.notes ?? '');
        }
        setLoading(false);
      });
  }, [toolId]);

  async function save() {
    await supabase.from('tools').update({
      name: name.trim() || tool?.name,
      type: type || null, size: size || null,
      material: material || null, notes: notes || null,
    }).eq('id', toolId);
  }

  async function saveType(t: string) {
    setType(t);
    await supabase.from('tools').update({ type: t }).eq('id', toolId);
  }

  if (loading) return <p style={{ color: '#9CA3AF' }}>Loading…</p>;
  if (!tool) return <p style={{ color: '#9CA3AF' }}>Not found.</p>;

  return (
    <div style={{ maxWidth: 600 }}>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 20 }}>← Back</button>

      {/* Inline-editable name */}
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={save}
        style={{ background: 'none', border: 'none', color: '#F9FAFB', fontSize: 24, fontWeight: 700, padding: 0, fontFamily: 'inherit', outline: 'none', width: '100%', display: 'block', marginBottom: 24 }}
        placeholder="Tool name"
      />

      <div className="card" style={{ cursor: 'default' }}>
        <p className="card-title" style={{ marginBottom: 16 }}>Details</p>

        <Field label="Type">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TOOL_TYPES.map(t => (
              <button key={t} onClick={() => saveType(t)} style={{
                padding: '5px 12px', borderRadius: 16, border: '1px solid',
                borderColor: type === t ? '#7C3AED' : '#374151',
                background: type === t ? '#7C3AED' : 'transparent',
                color: type === t ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 13,
              }}>{t}</button>
            ))}
          </div>
        </Field>

        <Field label="Size">
          <input style={fi} value={size} onChange={e => setSize(e.target.value)}
            onBlur={save} placeholder="e.g. 4mm, US 6" />
        </Field>

        <Field label="Material">
          <input style={fi} value={material} onChange={e => setMaterial(e.target.value)}
            onBlur={save} placeholder="e.g. Metal, Bamboo, Carbon Fibre" />
        </Field>

        <Field label="Notes">
          <textarea style={{ ...fi, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} onBlur={save}
            placeholder="Any notes..." />
        </Field>
      </div>

      <button onClick={async () => {
        if (!confirm('Delete this tool?')) return;
        await supabase.from('tools').delete().eq('id', toolId);
        onBack();
      }} style={{ marginTop: 16, width: '100%', padding: 12, borderRadius: 10, border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: 14 }}>
        Delete Tool
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', color: '#9CA3AF', fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

const fi: React.CSSProperties = {
  width: '100%', background: '#374151', border: '1px solid #4B5563',
  borderRadius: 8, padding: '8px 12px', color: '#F9FAFB', fontSize: 14,
  boxSizing: 'border-box', fontFamily: 'inherit',
};
