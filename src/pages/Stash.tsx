import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import YarnDetail from '../components/YarnDetail';
import { getPref } from '../lib/prefs';

type YarnCatalog = {
  id: string;
  name: string;
  brand: string | null;
  colorway: string | null;
  color_hex: string | null;
  weight: string | null;
  photo_url: string | null;
  stash: Array<{ id: string; quantity: number | null; unit: string; status: string }>;
};

type View = 'list' | 'detail' | 'new';
const WEIGHTS = ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky', 'Super Bulky'];
const UNITS = ['g', 'oz', 'yards', 'meters', 'skeins'];

export default function StashPage() {
  const [yarns, setYarns] = useState<YarnCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [colorway, setColorway] = useState('');
  const [colorHex, setColorHex] = useState('');
  const [weight, setWeight] = useState('');
  const [fiber, setFiber] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(() => getPref('DEFAULT_YARN_UNIT'));
  const [lot, setLot] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { if (view === 'list') fetchYarns(); }, [view]);

  async function fetchYarns() {
    setLoading(true);
    const { data } = await supabase
      .from('yarn_catalog')
      .select('*, stash:yarn_stash(id, quantity, unit, status)')
      .order('brand', { ascending: true });
    if (data) setYarns(data);
    setLoading(false);
  }

  function totalInStock(yarn: YarnCatalog) {
    return yarn.stash.filter(s => s.status === 'in_stock').reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  }

  function stockStatus(yarn: YarnCatalog) {
    const hasStock = yarn.stash.some(s => s.status === 'in_stock' && (s.quantity ?? 0) > 0);
    if (hasStock) return { label: 'In Stock', color: '#10B981' };
    if (yarn.stash.length > 0) return { label: 'Out of Stock', color: '#EF4444' };
    return { label: 'No Stock', color: '#6B7280' };
  }

  async function saveNew() {
    if (!name.trim()) return;
    setSaving(true);
    const { data: catalog, error } = await supabase.from('yarn_catalog').insert({
      name: name.trim(), brand: brand || null, colorway: colorway || null,
      color_hex: colorHex || null, weight: weight || null,
      fiber: fiber || null, shop_url: shopUrl || null, notes: notes || null,
    }).select().single();

    if (!error && catalog && quantity) {
      await supabase.from('yarn_stash').insert({
        yarn_catalog_id: catalog.id,
        name: name.trim(), brand: brand || null, colorway: colorway || null,
        color_hex: colorHex || null, weight: weight || null,
        quantity: parseFloat(quantity), unit, lot: lot || null,
        status: 'in_stock',
        date_acquired: new Date().toISOString().split('T')[0],
      });
    }
    setSaving(false);
    if (catalog) { setSelectedId(catalog.id); setView('detail'); }
  }

  if (view === 'detail' && selectedId) {
    return <YarnDetail yarnId={selectedId} onBack={() => setView('list')} />;
  }

  if (view === 'new') {
    return (
      <div>
        <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 20 }}>← Back</button>
        <h1>Add Yarn</h1>

        <p style={{ color: '#7C3AED', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>Yarn Details</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            ['Yarn Name *', name, setName, 'e.g. Cascade 220'],
            ['Brand', brand, setBrand, 'e.g. Cascade Yarns'],
            ['Colorway', colorway, setColorway, 'e.g. Deep Blue Sea'],
            ['Fiber', fiber, setFiber, 'e.g. 100% Merino Wool'],
            ['Shop URL', shopUrl, setShopUrl, 'https://...'],
          ].map(([label, value, setter, placeholder]) => (
            <div key={label as string} style={f.field}>
              <label style={f.label}>{label as string}</label>
              <input style={f.input} value={value as string}
                onChange={e => (setter as (v: string) => void)(e.target.value)}
                placeholder={placeholder as string} />
            </div>
          ))}

          <div style={f.field}>
            <label style={f.label}>Color Hex</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...f.input, flex: 1 }} value={colorHex}
                onChange={e => setColorHex(e.target.value)} placeholder="#3B82F6" maxLength={7} />
              {colorHex.length === 7 && <div style={{ width: 36, height: 36, borderRadius: 8, background: colorHex, flexShrink: 0 }} />}
            </div>
          </div>
        </div>

        <div style={f.field}>
          <label style={f.label}>Weight</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {WEIGHTS.map(w => (
              <button key={w} onClick={() => setWeight(w)} className="btn"
                style={{ background: weight === w ? '#7C3AED' : '#374151', color: weight === w ? '#fff' : '#9CA3AF', padding: '6px 12px', fontSize: 13 }}>
                {w}
              </button>
            ))}
          </div>
        </div>

        <div style={f.field}>
          <label style={f.label}>Notes</label>
          <textarea style={{ ...f.input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
        </div>

        <p style={{ color: '#7C3AED', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>Initial Stock (optional)</p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ ...f.field, marginBottom: 0 }}>
            <label style={f.label}>Quantity</label>
            <input style={{ ...f.input, width: 120 }} value={quantity}
              onChange={e => setQuantity(e.target.value)} type="number" placeholder="0" />
          </div>
          <div style={f.field}>
            <label style={f.label}>Unit</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {UNITS.map(u => (
                <button key={u} onClick={() => setUnit(u)} style={{
                  padding: '6px 12px', borderRadius: 16, border: '1px solid',
                  borderColor: unit === u ? '#7C3AED' : '#374151',
                  background: unit === u ? '#7C3AED' : 'transparent',
                  color: unit === u ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 13,
                }}>{u}</button>
              ))}
            </div>
          </div>
          <div style={{ ...f.field, marginBottom: 0 }}>
            <label style={f.label}>Lot Number</label>
            <input style={{ ...f.input, width: 160 }} value={lot}
              onChange={e => setLot(e.target.value)} placeholder="Dye lot" />
          </div>
        </div>

        <button className="btn btn-primary" onClick={saveNew} disabled={saving || !name.trim()}
          style={{ marginTop: 24, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Add to Catalog'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Yarn Stash</h1>
        <button className="btn btn-primary" onClick={() => setView('new')}>+ Add Yarn</button>
      </div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search stash…"
        style={{ width: '100%', background: '#1F2937', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', color: '#F9FAFB', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
      />
      {loading ? <p style={{ color: '#9CA3AF' }}>Loading…</p> : yarns.length === 0 ? (
        <p className="empty">Your stash is empty.</p>
      ) : (
        yarns.filter(y =>
          !search.trim() ||
          y.name.toLowerCase().includes(search.toLowerCase()) ||
          (y.brand ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (y.colorway ?? '').toLowerCase().includes(search.toLowerCase())
        ).map(y => {
          const status = stockStatus(y);
          const total = totalInStock(y);
          const unit = y.stash[0]?.unit ?? 'g';
          return (
            <div key={y.id} className="card" onClick={() => { setSelectedId(y.id); setView('detail'); }}>
              <div className="card-row" style={{ alignItems: 'center', gap: 12 }}>
                {y.photo_url
                  ? <YarnThumb storagePath={y.photo_url} fallback={y.color_hex} />
                  : <div className="color-dot" style={{ background: y.color_hex ?? '#6B7280' }} />
                }
                <div style={{ flex: 1 }}>
                  <p className="card-title">{y.colorway ?? y.name}</p>
                  <p className="card-sub">{y.name}{y.brand ? ` · ${y.brand}` : ''}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {total > 0 && <p className="card-title">{total} {unit}</p>}
                  <span style={{ background: status.color + '22', color: status.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                    {status.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })
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

function YarnThumb({ storagePath, fallback }: { storagePath: string; fallback: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from('yarn-photos').createSignedUrl(storagePath, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [storagePath]);

  if (!url) return <div className="color-dot" style={{ background: fallback ?? '#6B7280' }} />;

  return (
    <img
      src={url}
      alt="yarn"
      style={{ width: 40, height: 40, borderRadius: 20, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}
