import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import YarnDetail from '../components/YarnDetail';
import YarnWeightReference from '../components/YarnWeightReference';
import { getPref } from '../lib/prefs';
import { recordRecentItem } from './Dashboard';

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
  const [weightFilter, setWeightFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock'>('all');
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
    if (hasStock) return { label: 'In Stock', color: 'var(--success-vivid)' };
    if (yarn.stash.length > 0) return { label: 'Out of Stock', color: 'var(--danger-vivid)' };
    return { label: 'No Stock', color: 'var(--neutral-vivid)' };
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

        <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>Yarn Details</p>

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
                style={{ background: weight === w ? 'var(--primary)' : 'var(--bg-input)', color: weight === w ? 'var(--primary-text)' : 'var(--text-muted)', border: `1px solid ${weight === w ? 'var(--primary)' : 'var(--border-medium)'}`, padding: '6px 12px', fontSize: 13 }}>
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

        <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>Initial Stock (optional)</p>

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
                  borderColor: unit === u ? 'var(--primary)' : 'var(--border-medium)',
                  background: unit === u ? 'var(--primary)' : 'transparent',
                  color: unit === u ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
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

        <div style={{ marginTop: 32 }}>
          <YarnWeightReference />
        </div>
      </div>
    );
  }

  // Derive all weights present in stash for filter chips
  const allWeights = Array.from(new Set(yarns.map(y => y.weight).filter(Boolean))) as string[];

  const filtered = yarns.filter(y => {
    const matchSearch = !search.trim() ||
      y.name.toLowerCase().includes(search.toLowerCase()) ||
      (y.brand ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (y.colorway ?? '').toLowerCase().includes(search.toLowerCase());
    const matchWeight = weightFilter === 'all' || y.weight === weightFilter;
    const matchStock = stockFilter === 'all' || y.stash.some(s => s.status === 'in_stock' && (s.quantity ?? 0) > 0);
    return matchSearch && matchWeight && matchStock;
  });

  // Total yardage across all in-stock entries (yards only)
  const totalYards = yarns.reduce((sum, y) => {
    return sum + y.stash
      .filter(s => s.status === 'in_stock')
      .reduce((s2, s) => {
        if (s.unit === 'yards' || s.unit === 'yds') return s2 + (s.quantity ?? 0);
        if (s.unit === 'meters' || s.unit === 'm') return s2 + (s.quantity ?? 0) * 1.094;
        return s2;
      }, 0);
  }, 0);

  return (
    <div>
      <div className="page-header">
        <h1>Yarn Stash</h1>
        <button className="btn btn-primary" onClick={() => setView('new')}>+ Add Yarn</button>
      </div>

      {/* Summary strip */}
      {!loading && yarns.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', flex: 1 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Total yarns</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{yarns.length}</p>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', flex: 1 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>In stock</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              {yarns.filter(y => y.stash.some(s => s.status === 'in_stock' && (s.quantity ?? 0) > 0)).length}
            </p>
          </div>
          {totalYards > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', flex: 1 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Total yardage (approx)</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(totalYards).toLocaleString()} yds</p>
            </div>
          )}
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search stash…"
          style={{ flex: 1, minWidth: 200, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-body)', fontSize: 14, boxSizing: 'border-box' as const }}
        />
        <button onClick={() => setStockFilter(s => s === 'all' ? 'in_stock' : 'all')} style={{
          padding: '7px 14px', borderRadius: 8, border: '1px solid',
          borderColor: stockFilter === 'in_stock' ? 'var(--success-vivid)' : 'var(--border-medium)',
          background: stockFilter === 'in_stock' ? 'var(--success-vivid-bg)' : 'transparent',
          color: stockFilter === 'in_stock' ? 'var(--success-vivid)' : 'var(--text-muted)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>In Stock Only</button>
      </div>

      {/* Weight filter chips */}
      {allWeights.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {['all', ...WEIGHTS.filter(w => allWeights.includes(w))].map(w => (
            <button key={w} onClick={() => setWeightFilter(w)} style={{
              padding: '4px 12px', borderRadius: 16, border: '1px solid',
              borderColor: weightFilter === w ? 'var(--primary)' : 'var(--border-medium)',
              background: weightFilter === w ? 'var(--primary)' : 'transparent',
              color: weightFilter === w ? 'var(--primary-text)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>{w === 'all' ? 'All weights' : w}</button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : filtered.length === 0 ? (
        <p className="empty">{search || weightFilter !== 'all' || stockFilter !== 'all' ? 'No matching yarn.' : 'Your stash is empty.'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {filtered.map(y => {
            const status = stockStatus(y);
            const total = totalInStock(y);
            const stashUnit = y.stash.find(s => s.status === 'in_stock')?.unit ?? y.stash[0]?.unit ?? 'g';
            return (
              <div key={y.id}
                onClick={() => {
                  setSelectedId(y.id);
                  setView('detail');
                  recordRecentItem({
                    id: y.id, name: y.colorway ?? y.name, type: 'yarn',
                    meta: `${y.brand ? y.brand + ' · ' : ''}${total > 0 ? `${total} ${stashUnit} in stock` : 'out of stock'}`,
                    path: '/stash', color: y.color_hex ?? '#BA7517',
                  });
                }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Swatch */}
                <div style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden', background: y.color_hex ?? 'var(--bg-muted)' }}>
                  {y.photo_url
                    ? <YarnThumb storagePath={y.photo_url} fallback={y.color_hex} />
                    : y.color_hex
                      ? null  /* colour fill from background */
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, opacity: 0.3 }}>🧶</div>
                  }
                  {/* Weight pill */}
                  {y.weight && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                      color: '#fff', fontSize: 10, fontWeight: 600,
                      padding: '2px 7px', borderRadius: 10, letterSpacing: '0.04em',
                    }}>{y.weight}</div>
                  )}
                  {/* Out of stock overlay */}
                  {status.label !== 'In Stock' && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(0,0,0,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 8 }}>{status.label}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '10px 12px 12px' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {y.colorway ?? y.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {y.name}{y.brand ? ` · ${y.brand}` : ''}
                  </p>
                  {total > 0 && (
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--success-vivid)', marginTop: 6 }}>
                      {total.toLocaleString()} {stashUnit}
                    </p>
                  )}
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
  label: { display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 6 } as React.CSSProperties,
  input: {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)',
    borderRadius: 8, padding: '10px 12px', color: 'var(--text-body)', fontSize: 15,
    boxSizing: 'border-box',
  } as React.CSSProperties,
};

function YarnThumb({ storagePath, fallback }: { storagePath: string; fallback: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from('yarn-photos').createSignedUrl(storagePath, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [storagePath]);

  if (!url) return null; // fallback handled by parent background colour

  return (
    <img
      src={url}
      alt="yarn"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}
