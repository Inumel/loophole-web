import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type YarnCatalog = {
  id: string;
  name: string;
  brand: string | null;
  colorway: string | null;
  color_hex: string | null;
  weight: string | null;
  fiber: string | null;
  shop_url: string | null;
  notes: string | null;
  photo_url: string | null;
};

type StashEntry = {
  id: string;
  quantity: number | null;
  unit: string;
  status: string;
  lot: string | null;
  date_acquired: string | null;
};

type LinkedProject = {
  id: string;
  quantity_used: number | null;
  unit: string;
  project: { id: string; name: string; status: string } | null;
};

const WEIGHTS = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];
const UNITS = ['g', 'oz', 'yards', 'meters', 'skeins'];

type Props = { yarnId: string; onBack: () => void };

export default function YarnDetail({ yarnId, onBack }: Props) {
  const [yarn, setYarn] = useState<YarnCatalog | null>(null);
  const [stash, setStash] = useState<StashEntry[]>([]);
  const [projects, setProjects] = useState<LinkedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStash, setShowAddStash] = useState(false);
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [newLot, setNewLot] = useState('');
  const [savingStash, setSavingStash] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [colorway, setColorway] = useState('');
  const [colorHex, setColorHex] = useState('');
  const [weight, setWeight] = useState('');
  const [fiber, setFiber] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { fetchAll(); }, [yarnId]);

  async function fetchAll() {
    const [catalogRes, stashRes, projectsRes] = await Promise.all([
      supabase.from('yarn_catalog').select('*').eq('id', yarnId).single(),
      supabase.from('yarn_stash').select('id, quantity, unit, status, lot, date_acquired')
        .eq('yarn_catalog_id', yarnId).order('date_acquired', { ascending: false }),
      supabase.from('project_yarn')
        .select('id, quantity_used, unit, project:projects(id, name, status)')
        .eq('yarn_stash_id', yarnId),
    ]);

    if (catalogRes.data) {
      const d = catalogRes.data;
      setYarn(d);
      setName(d.name); setBrand(d.brand ?? ''); setColorway(d.colorway ?? '');
      setColorHex(d.color_hex ?? ''); setWeight(d.weight ?? '');
      setFiber(d.fiber ?? ''); setShopUrl(d.shop_url ?? ''); setNotes(d.notes ?? '');

      // Load photo if exists
      if (d.photo_url) {
        const { data: urlData } = await supabase.storage
          .from('yarn-photos')
          .createSignedUrl(d.photo_url, 3600);
        if (urlData?.signedUrl) setPhotoUrl(urlData.signedUrl);
      }
    }
    if (stashRes.data) setStash(stashRes.data);
    if (projectsRes.data) setProjects(projectsRes.data);
    setLoading(false);
  }

  async function save() {
    await supabase.from('yarn_catalog').update({
      name: name.trim() || yarn?.name,
      brand: brand || null, colorway: colorway || null,
      color_hex: colorHex || null, weight: weight || null,
      fiber: fiber || null, shop_url: shopUrl || null, notes: notes || null,
    }).eq('id', yarnId);
  }

  async function saveWeight(w: string) {
    setWeight(w);
    await supabase.from('yarn_catalog').update({ weight: w }).eq('id', yarnId);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);

    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${yarnId}/photo.${ext}`;

      // Remove old photo if exists
      if (yarn?.photo_url) {
        await supabase.storage.from('yarn-photos').remove([yarn.photo_url]);
      }

      const { error } = await supabase.storage
        .from('yarn-photos')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error) throw error;

      // Save path to catalog
      await supabase.from('yarn_catalog').update({ photo_url: path }).eq('id', yarnId);

      // Get signed URL for display
      const { data: urlData } = await supabase.storage
        .from('yarn-photos')
        .createSignedUrl(path, 3600);
      if (urlData?.signedUrl) setPhotoUrl(urlData.signedUrl);
    } catch (err) {
      console.error('Photo upload failed:', err);
      alert('Photo upload failed. Please try again.');
    }
    setUploadingPhoto(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function removePhoto() {
    if (!yarn?.photo_url) return;
    if (!confirm('Remove this photo?')) return;
    await supabase.storage.from('yarn-photos').remove([yarn.photo_url]);
    await supabase.from('yarn_catalog').update({ photo_url: null }).eq('id', yarnId);
    setPhotoUrl(null);
    setYarn(prev => prev ? { ...prev, photo_url: null } : prev);
  }

  async function addStash() {
    if (!newQty) return;
    setSavingStash(true);
    await supabase.from('yarn_stash').insert({
      yarn_catalog_id: yarnId,
      name: yarn?.name, brand: yarn?.brand,
      colorway: yarn?.colorway, color_hex: yarn?.color_hex,
      weight: yarn?.weight,
      quantity: parseFloat(newQty), unit: newUnit,
      lot: newLot || null, status: 'in_stock',
      date_acquired: new Date().toISOString().split('T')[0],
    });
    setSavingStash(false);
    setShowAddStash(false);
    setNewQty(''); setNewLot(''); setNewUnit('g');
    fetchAll();
  }

  async function toggleStatus(s: StashEntry) {
    await supabase.from('yarn_stash').update({
      status: s.status === 'in_stock' ? 'out_of_stock' : 'in_stock'
    }).eq('id', s.id);
    fetchAll();
  }

  async function deleteStash(stashId: string) {
    if (!confirm('Remove this stash entry?')) return;
    await supabase.from('yarn_stash').delete().eq('id', stashId);
    fetchAll();
  }

  const totalInStock = stash.filter(s => s.status === 'in_stock').reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const totalUsed = projects.reduce((sum, p) => sum + (p.quantity_used ?? 0), 0);

  if (loading) return <p style={{ color: '#9CA3AF' }}>Loading…</p>;
  if (!yarn) return <p style={{ color: '#9CA3AF' }}>Not found.</p>;

  return (
    <div>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 20 }}>← Back</button>

      {/* Header */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
        {/* Photo / color swatch */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={yarn.name}
              style={{ width: 96, height: 96, borderRadius: 12, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: 12, background: colorHex || '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>No photo</span>
            </div>
          )}
          {/* Upload overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            style={{
              position: 'absolute', bottom: 0, right: 0,
              background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '0 0 12px 0',
              color: '#fff', fontSize: 11, padding: '4px 8px', cursor: 'pointer',
            }}
          >
            {uploadingPhoto ? '…' : '📷'}
          </button>
          {photoUrl && (
            <button
              onClick={removePhoto}
              style={{
                position: 'absolute', top: 0, right: 0,
                background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: '0 12px 0 0',
                color: '#fff', fontSize: 11, padding: '4px 6px', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />
        </div>

        <div style={{ flex: 1 }}>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={save}
            style={fi.title} placeholder="Yarn name" />
          <input value={brand} onChange={e => setBrand(e.target.value)} onBlur={save}
            style={{ ...fi.subtitle, display: 'block', marginTop: 4 }} placeholder="Brand" />
          {!photoUrl && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{ marginTop: 8, background: 'none', border: '1px dashed #374151', color: '#6B7280', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
            >
              {uploadingPhoto ? 'Uploading…' : '+ Add photo'}
            </button>
          )}
        </div>
      </div>

      {/* Stock summary */}
      <div style={{ display: 'flex', background: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'center' }}>
        {[
          ['In Stock', `${totalInStock} ${stash[0]?.unit ?? 'g'}`, '#10B981'],
          ['Used in Projects', `${totalUsed}`, '#EF4444'],
          ['Batches', String(stash.length), '#A78BFA'],
        ].map(([label, value, color], i) => (
          <div key={label} style={{ flex: 1, borderLeft: i > 0 ? '1px solid #374151' : 'none', padding: '0 8px' }}>
            <p style={{ color: color as string, fontSize: 20, fontWeight: 700 }}>{value}</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left — catalog details */}
        <div>
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 16 }}>Yarn Details</p>

            {[
              ['Colorway', colorway, setColorway, 'e.g. Deep Blue Sea'],
              ['Fiber', fiber, setFiber, 'e.g. 100% Merino Wool'],
            ].map(([label, value, setter, placeholder]) => (
              <Field key={label as string} label={label as string}>
                <input style={fi.input} value={value as string}
                  onChange={e => (setter as (v: string) => void)(e.target.value)}
                  onBlur={save} placeholder={placeholder as string} />
              </Field>
            ))}

            <Field label="Color Hex">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...fi.input, flex: 1 }} value={colorHex}
                  onChange={e => setColorHex(e.target.value)} onBlur={save}
                  placeholder="#3B82F6" maxLength={7} />
                {colorHex.length === 7 && (
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: colorHex, flexShrink: 0 }} />
                )}
              </div>
            </Field>

            <Field label="Weight">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {WEIGHTS.map(w => (
                  <button key={w} onClick={() => saveWeight(w)} style={{
                    padding: '4px 10px', borderRadius: 16, border: '1px solid',
                    borderColor: weight === w ? '#7C3AED' : '#374151',
                    background: weight === w ? '#7C3AED' : 'transparent',
                    color: weight === w ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                  }}>{w}</button>
                ))}
              </div>
            </Field>

            <Field label="Shop URL">
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...fi.input, flex: 1 }} value={shopUrl}
                  onChange={e => setShopUrl(e.target.value)} onBlur={save}
                  placeholder="https://..." />
                {shopUrl && (
                  <a href={shopUrl} target="_blank" rel="noreferrer"
                    style={{ background: '#374151', borderRadius: 8, padding: '8px 14px', color: '#A78BFA', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    Open ↗
                  </a>
                )}
              </div>
            </Field>

            <Field label="Notes">
              <textarea style={{ ...fi.input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                value={notes} onChange={e => setNotes(e.target.value)} onBlur={save}
                placeholder="Any notes..." />
            </Field>
          </div>
        </div>

        {/* Right — stash + projects */}
        <div>
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="card-title">Stash Entries</p>
              <button onClick={() => setShowAddStash(!showAddStash)}
                style={{ background: '#374151', border: 'none', color: '#A78BFA', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                + Restock
              </button>
            </div>

            {stash.length === 0 && !showAddStash && (
              <p style={{ color: '#6B7280', fontSize: 13, fontStyle: 'italic' }}>No stash entries yet.</p>
            )}

            {stash.map(s => (
              <div key={s.id} style={{ paddingTop: 10, borderTop: '1px solid #374151' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#F9FAFB', fontSize: 16, fontWeight: 700 }}>{s.quantity ?? 0} {s.unit}</p>
                    {s.lot && <p style={{ color: '#6B7280', fontSize: 12 }}>Lot: {s.lot}</p>}
                    {s.date_acquired && <p style={{ color: '#6B7280', fontSize: 12 }}>Acquired: {s.date_acquired}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <button onClick={() => toggleStatus(s)} style={{
                      background: s.status === 'in_stock' ? '#10B98122' : '#EF444422',
                      color: s.status === 'in_stock' ? '#10B981' : '#EF4444',
                      border: 'none', borderRadius: 6, padding: '3px 10px',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                      {s.status === 'in_stock' ? 'In Stock' : 'Out of Stock'}
                    </button>
                    <button onClick={() => deleteStash(s.id)}
                      style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 12, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {showAddStash && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #374151' }}>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>Add batch / restock</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={newQty} onChange={e => setNewQty(e.target.value)} type="number"
                    placeholder="Qty" style={{ ...fi.input, width: 80 }} />
                  {UNITS.map(u => (
                    <button key={u} onClick={() => setNewUnit(u)} style={{
                      padding: '6px 10px', borderRadius: 16, border: '1px solid',
                      borderColor: newUnit === u ? '#7C3AED' : '#374151',
                      background: newUnit === u ? '#7C3AED' : 'transparent',
                      color: newUnit === u ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 12,
                    }}>{u}</button>
                  ))}
                </div>
                <input value={newLot} onChange={e => setNewLot(e.target.value)}
                  placeholder="Lot number (optional)" style={{ ...fi.input, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={addStash}
                    disabled={savingStash || !newQty} style={{ flex: 1, opacity: savingStash ? 0.6 : 1 }}>
                    {savingStash ? 'Adding…' : 'Add Batch'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowAddStash(false)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {projects.length > 0 && (
            <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
              <p className="card-title" style={{ marginBottom: 12 }}>Used in Projects</p>
              {projects.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: '1px solid #374151' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#F9FAFB', fontSize: 14, fontWeight: 600 }}>{p.project?.name ?? 'Unknown'}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{p.project?.status}</p>
                  </div>
                  {p.quantity_used != null && (
                    <span style={{ color: '#A78BFA', fontWeight: 600, fontSize: 13 }}>{p.quantity_used} {p.unit}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <button onClick={async () => {
            if (!confirm('Delete this yarn from your catalog permanently? This cannot be undone.')) return;
            if (yarn.photo_url) await supabase.storage.from('yarn-photos').remove([yarn.photo_url]);
            await supabase.from('yarn_stash').delete().eq('yarn_catalog_id', yarnId);
            await supabase.from('yarn_catalog').delete().eq('id', yarnId);
            onBack();
          }} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: 14 }}>
            Delete from Catalog
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: '#9CA3AF', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const fi = {
  title: { background: 'none', border: 'none', color: '#F9FAFB', fontSize: 22, fontWeight: 700, padding: 0, fontFamily: 'inherit', outline: 'none', width: '100%', display: 'block' } as React.CSSProperties,
  subtitle: { background: 'none', border: 'none', color: '#9CA3AF', fontSize: 15, padding: 0, fontFamily: 'inherit', outline: 'none', width: '100%' } as React.CSSProperties,
  input: {
    width: '100%', background: '#374151', border: '1px solid #4B5563',
    borderRadius: 8, padding: '8px 12px', color: '#F9FAFB', fontSize: 14,
    boxSizing: 'border-box', fontFamily: 'inherit',
  } as React.CSSProperties,
};
