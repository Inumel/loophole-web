import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { searchRavelryPatterns, getRavelryPattern, mapRavelryPattern } from '../lib/ravelry';
import { parsePatternWithClaude } from '../lib/claude';
import StepText from '../components/StepText';
import { difficultyColor, stepDifficulty } from '../lib/theme';

type Pattern = {
  id: string; name: string; designer: string | null; source: string;
  category: string | null; yarn_weight: string | null; needle_size: string | null;
  gauge_stitches: number | null; gauge_rows: number | null; gauge_unit: string | null;
  difficulty: string | null; stitch_patterns: string[] | null;
  yarn_quantity: Array<{ amount: number; unit: string; size?: string; color?: string; note?: string }> | null;
  notes: string | null; parsed_guide: Record<string, unknown> | null;
};

type RavelryResult = {
  id: number; name: string;
  designer: { name: string } | null; yarn_weight: string | null;
};

type View = 'list' | 'detail' | 'new' | 'new-project';
type Mode = 'manual' | 'ravelry' | 'pdf';

const sourceIcon: Record<string, string> = { ravelry: '🧶', pdf: '📄', manual: '✏️', generated: '✨' };

function getSteps(sec: { steps?: unknown; steps_by_size?: Record<string, unknown> }): string[] {
  if (sec.steps_by_size && Object.keys(sec.steps_by_size).length > 0) {
    const firstKey = Object.keys(sec.steps_by_size)[0];
    const val = sec.steps_by_size[firstKey];
    if (Array.isArray(val)) return val as string[];
    // Sometimes Sonnet returns steps_by_size with object values instead of arrays
    if (val && typeof val === 'object') return Object.values(val as object) as string[];
  }
  if (Array.isArray(sec.steps)) return sec.steps as string[];
  // Handle case where steps is a single string
  if (typeof sec.steps === 'string') return [sec.steps];
  return [];
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Pattern | null>(null);

  // New pattern form
  const [mode, setMode] = useState<Mode>('manual');
  const [name, setName] = useState('');
  const [designer, setDesigner] = useState('');
  const [category, setCategory] = useState('');
  const [yarnWeight, setYarnWeight] = useState('');
  const [needleSize, setNeedleSize] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [ravelryMapped, setRavelryMapped] = useState<ReturnType<typeof mapRavelryPattern> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RavelryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRavelry, setSelectedRavelry] = useState<RavelryResult | null>(null);

  // PDF
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reparsePdfRef = useRef<HTMLInputElement>(null);
  const [pdfName, setPdfName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedGuide, setParsedGuide] = useState<Record<string, unknown> | null>(null);

  // New project from pattern
  const [newProjectName, setNewProjectName] = useState('');
  const [availableSizes, setAvailableSizes] = useState<string[]>([]);
  const [chosenSize, setChosenSize] = useState('');
  const [availableVariations, setAvailableVariations] = useState<string[]>([]);
  const [chosenVariation, setChosenVariation] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  // Yarn selection for new project
  const [newProjectYarns, setNewProjectYarns] = useState<Array<{ stashId: string | null; name: string; colorHex: string | null; quantity: string; unit: string; role: string }>>([]);
  const [stashYarns, setStashYarns] = useState<Array<{ id: string; name: string; brand: string | null; color_hex: string | null; stash: Array<{ id: string; quantity: number | null; unit: string; status: string }> }>>([]);
  const [showYarnPicker, setShowYarnPicker] = useState(false);
  const [pickingYarnIndex, setPickingYarnIndex] = useState<number | null>(null);
  const [yarnSearch, setYarnSearch] = useState('');
  // List search
  const [listSearch, setListSearch] = useState('');
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => { if (view === 'list') fetchPatterns(); }, [view]);

  async function fetchPatterns() {
    setLoading(true);
    const { data } = await supabase.from('patterns').select('*').order('created_at', { ascending: false });
    if (data) setPatterns(data);
    setLoading(false);
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchResults([]);
    try { setSearchResults(await searchRavelryPatterns(searchQuery)); }
    catch { alert('Ravelry search failed.'); }
    setSearching(false);
  }

  async function pickRavelry(r: RavelryResult) {
    setSelectedRavelry(r); setName(r.name); setDesigner(r.designer?.name ?? '');
    try {
      const full = await getRavelryPattern(r.id);
      const mapped = mapRavelryPattern(full);
      setRavelryMapped(mapped);
      if (mapped.needle_size) setNeedleSize(mapped.needle_size);
      if (mapped.category) setCategory(mapped.category);
      if (mapped.yarn_weight) setYarnWeight(mapped.yarn_weight);
    } catch { /* non-fatal */ }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name); setParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const guide = await parsePatternWithClaude(base64) as Record<string, unknown>;
      setParsedGuide(guide);
      if (typeof guide.name === 'string' && guide.name) setName(guide.name);
      if (typeof guide.designer === 'string' && guide.designer) setDesigner(guide.designer);
      if (typeof guide.yarn_weight === 'string' && guide.yarn_weight) setYarnWeight(guide.yarn_weight);
      if (typeof guide.needles === 'string' && guide.needles) setNeedleSize(guide.needles);
    } catch { alert('Could not parse PDF. Fill in details manually.'); }
    setParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleReparsePdf(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const guide = await parsePatternWithClaude(base64) as Record<string, unknown>;
      const updates: Record<string, unknown> = { parsed_guide: guide };
      if (typeof guide.difficulty === 'string' && guide.difficulty) updates.difficulty = guide.difficulty;
      if (Array.isArray(guide.stitch_patterns)) updates.stitch_patterns = guide.stitch_patterns;
      if (guide.gauge) {
        const g = guide.gauge as Record<string, unknown>;
        if (g.stitches) updates.gauge_stitches = g.stitches;
        if (g.rows) updates.gauge_rows = g.rows;
        if (g.unit) updates.gauge_unit = g.unit;
      }
      if (Array.isArray(guide.yarn_quantity)) updates.yarn_quantity = guide.yarn_quantity;
      await supabase.from('patterns').update(updates).eq('id', selected.id);
      const { data } = await supabase.from('patterns').select('*').eq('id', selected.id).single();
      if (data) setSelected(data);
      alert('Pattern instructions updated.');
    } catch { alert('Could not parse PDF.'); }
    setParsing(false);
    if (reparsePdfRef.current) reparsePdfRef.current.value = '';
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1]);
      r.onerror = () => rej(new Error('Read failed'));
      r.readAsDataURL(file);
    });
  }

  async function saveNew() {
    if (!name.trim()) return;
    setSaving(true);
    const rm = ravelryMapped;
    const g = parsedGuide;
    const { data } = await supabase.from('patterns').insert({
      name: name.trim(), designer: designer || null, category: category || null,
      yarn_weight: yarnWeight || null, needle_size: needleSize || null,
      notes: notes || null, source: mode,
      ravelry_id: selectedRavelry ? String(selectedRavelry.id) : null,
      parsed_guide: parsedGuide ?? null,
      gauge_stitches: g?.gauge ? (g.gauge as Record<string, unknown>).stitches ?? rm?.gauge_stitches ?? null : rm?.gauge_stitches ?? null,
      gauge_rows: g?.gauge ? (g.gauge as Record<string, unknown>).rows ?? rm?.gauge_rows ?? null : rm?.gauge_rows ?? null,
      gauge_unit: g?.gauge ? (g.gauge as Record<string, unknown>).unit ?? rm?.gauge_unit ?? 'per 10cm' : rm?.gauge_unit ?? 'per 10cm',
      yarn_quantity: g?.yarn_quantity ?? rm?.yarn_quantity ?? null,
      difficulty: (typeof g?.difficulty === 'string' ? g.difficulty || null : null) ?? rm?.difficulty ?? null,
      stitch_patterns: g?.stitch_patterns ?? rm?.stitch_patterns ?? null,
    }).select().single();
    setSaving(false);
    resetForm();
    if (data) { setSelected(data); setView('detail'); }
    else setView('list');
  }

  function resetForm() {
    setName(''); setDesigner(''); setCategory(''); setYarnWeight('');
    setNeedleSize(''); setNotes(''); setSelectedRavelry(null);
    setSearchQuery(''); setSearchResults([]); setRavelryMapped(null);
    setPdfName(''); setParsedGuide(null);
  }

  function openNewProject(pattern: Pattern) {
    setSelected(pattern);
    const guide = pattern.parsed_guide as Record<string, unknown> | null;
    const sizes = guide?.sizes as string[] | null;
    const variations = guide?.color_variations as string[] | null;
    setAvailableSizes(sizes ?? []);
    setAvailableVariations(variations ?? []);
    setChosenVariation(null);
    const firstSize = sizes?.length === 1 ? sizes[0] : '';
    setChosenSize(firstSize);
    const sizeSuffix = firstSize && firstSize !== 'One Size' ? ` - ${firstSize}` : '';
    setNewProjectName(`${pattern.name}${sizeSuffix}`);

    // Pre-fill yarn slots from yarn_quantity
    const yarnQty = pattern.yarn_quantity as Array<{ amount: number; unit: string; color?: string; size?: string }> | null;
    if (yarnQty && yarnQty.length > 0) {
      const seen = new Set<string>();
      const uniqueRoles: string[] = [];
      for (const y of yarnQty) {
        const role = y.color?.trim() || 'MC';
        if (!seen.has(role)) { seen.add(role); uniqueRoles.push(role); }
      }
      setNewProjectYarns(uniqueRoles.slice(0, 4).map(role => ({
        stashId: null, name: '', colorHex: null, quantity: '', unit: 'yards', role,
      })));
    } else {
      setNewProjectYarns([{ stashId: null, name: '', colorHex: null, quantity: '', unit: 'yards', role: 'MC' }]);
    }

    // Load stash
    supabase.from('yarn_catalog')
      .select('id, name, brand, color_hex, stash:yarn_stash(id, quantity, unit, status)')
      .order('name', { ascending: true })
      .then(({ data }) => { if (data) setStashYarns(data); });

    setView('new-project');
  }

  async function saveProject() {
    if (!newProjectName.trim() || !selected) return;
    if (availableSizes.length > 1 && !chosenSize) { alert('Please choose a size.'); return; }
    setSavingProject(true);
    const { data } = await supabase.from('projects').insert({
      name: newProjectName.trim(),
      pattern_id: selected.id,
      chosen_size: chosenSize || (availableSizes[0] ?? null),
      chosen_color_variation: chosenVariation ?? null,
      status: 'active', current_row: 0,
      started_at: new Date().toISOString().split('T')[0],
    }).select().single();

    if (data) {
      const yarnsToLink = newProjectYarns.filter(y => y.stashId);
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
    }

    setSavingProject(false);
    setView('detail');
  }

  // ── New project view ─────────────────────────────────────────────────────────
  if (view === 'new-project' && selected) {
    return (
      <div style={{ maxWidth: 500 }}>
        <button className="btn btn-secondary" onClick={() => setView('detail')} style={{ marginBottom: 20 }}>← Back</button>
        <h1>Start a Project</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>Pattern: {selected.name}</p>

        <div style={fi.field}>
          <label style={fi.label}>Project Name *</label>
          <input style={fi.input} value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
        </div>

        {availableSizes.length > 1 && (
          <div style={fi.field}>
            <label style={fi.label}>Size *</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableSizes.map(s => (
                <button key={s} onClick={() => {
                  setChosenSize(s);
                  const suffix = s && s !== 'One Size' ? ` - ${s}` : '';
                  setNewProjectName(`${selected.name}${suffix}`);
                }} style={{
                  padding: '8px 16px', borderRadius: 20, border: '1px solid',
                  borderColor: chosenSize === s ? 'var(--primary)' : 'var(--border-medium)',
                  background: chosenSize === s ? 'var(--primary)' : 'transparent',
                  color: chosenSize === s ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
                }}>{s}</button>
              ))}
            </div>
            {chosenSize && <p style={{ color: 'var(--success-vivid)', fontSize: 12, marginTop: 8 }}>✓ Steps will be shown for size: {chosenSize}</p>}
          </div>
        )}

        {availableVariations.length > 0 && (
          <div style={fi.field}>
            <label style={fi.label}>Colour variation (optional)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setChosenVariation(null)} style={{
                padding: '8px 16px', borderRadius: 20, border: '1px solid',
                borderColor: chosenVariation === null ? 'var(--primary)' : 'var(--border-medium)',
                background: chosenVariation === null ? 'var(--primary)' : 'transparent',
                color: chosenVariation === null ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
              }}>None</button>
              {availableVariations.map(v => (
                <button key={v} onClick={() => {
                  setChosenVariation(v);
                  const sizeSuffix = chosenSize && chosenSize !== 'One Size' ? ` - ${chosenSize}` : '';
                  setNewProjectName(`${selected.name}${sizeSuffix} (${v})`);
                }} style={{
                  padding: '8px 16px', borderRadius: 20, border: '1px solid',
                  borderColor: chosenVariation === v ? 'var(--primary)' : 'var(--border-medium)',
                  background: chosenVariation === v ? 'var(--primary)' : 'transparent',
                  color: chosenVariation === v ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
                }}>{v}</button>
              ))}
            </div>
            {chosenVariation && <p style={{ color: 'var(--success-vivid)', fontSize: 12, marginTop: 8 }}>✓ Variation: {chosenVariation}</p>}
          </div>
        )}

        {/* Yarn selection */}
        <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Yarn from Stash (optional)</p>
        {newProjectYarns.map((yarn, index) => (
          <div key={index} style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 14, marginBottom: 10, border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <input value={yarn.role}
                onChange={e => setNewProjectYarns(prev => prev.map((y, i) => i === index ? { ...y, role: e.target.value } : y))}
                placeholder="MC / CC1…"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-body)', fontSize: 13, width: 100 }} />
              {newProjectYarns.length > 1 && (
                <button onClick={() => setNewProjectYarns(prev => prev.filter((_, i) => i !== index))}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              )}
            </div>
            {yarn.name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-accent)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: yarn.colorHex ?? 'var(--text-faint)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, flex: 1 }}>{yarn.name}</span>
                <button onClick={() => { setPickingYarnIndex(index); setShowYarnPicker(true); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13 }}>Change</button>
              </div>
            ) : (
              <button onClick={() => { setPickingYarnIndex(index); setShowYarnPicker(true); }}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px dashed var(--border-medium)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 14, marginBottom: 10 }}>
                + Pick from stash
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setNewProjectYarns(prev => [...prev, { stashId: null, name: '', colorHex: null, quantity: '', unit: 'yards', role: `CC${prev.length}` }])}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-medium)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 24 }}>
          + Add another yarn
        </button>

        <button className="btn btn-primary" onClick={saveProject}
          disabled={savingProject || !newProjectName.trim() || (availableSizes.length > 1 && !chosenSize)}
          style={{ marginTop: 8, opacity: savingProject ? 0.6 : 1 }}>
          {savingProject ? 'Creating…' : 'Create Project'}
        </button>

        {/* Yarn picker modal */}
        {showYarnPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>Pick a Yarn</p>
                <button onClick={() => { setShowYarnPicker(false); setPickingYarnIndex(null); setYarnSearch(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <input value={yarnSearch} onChange={e => setYarnSearch(e.target.value)}
                placeholder="Search…" style={{ ...fi.input, marginBottom: 12 }} />
              <div style={{ overflow: 'auto', flex: 1 }}>
                {stashYarns
                  .filter(y => !yarnSearch.trim() || y.name.toLowerCase().includes(yarnSearch.toLowerCase()) || (y.brand ?? '').toLowerCase().includes(yarnSearch.toLowerCase()))
                  .map(y => {
                    const inStock = y.stash?.find(s => s.status === 'in_stock');
                    const stashEntry = inStock ?? y.stash?.[0];
                    const qty = stashEntry?.quantity;
                    const unit = stashEntry?.unit ?? 'g';
                    return (
                      <div key={y.id} onClick={() => {
                        if (pickingYarnIndex === null) return;
                        setNewProjectYarns(prev => prev.map((yarn, i) => i === pickingYarnIndex ? {
                          ...yarn, stashId: stashEntry?.id ?? null, name: y.name,
                          colorHex: y.color_hex, unit: unit,
                        } : yarn));
                        setShowYarnPicker(false); setPickingYarnIndex(null); setYarnSearch('');
                      }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 12, background: y.color_hex ?? 'var(--text-faint)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{y.name}</p>
                          {y.brand && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{y.brand}</p>}
                        </div>
                        {qty != null && <span style={{ color: inStock ? 'var(--success-vivid)' : 'var(--danger-vivid)', fontSize: 13 }}>{qty} {unit}{!inStock ? ' (out)' : ''}</span>}
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

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const rawSections = selected.parsed_guide?.sections;
    const sections = Array.isArray(rawSections) && rawSections.length > 0
      ? (rawSections as Array<{ title: string; steps?: string[]; steps_by_size?: Record<string, string[]> }>)
      : null;
    const safeStitchPatterns = Array.isArray(selected.stitch_patterns) ? selected.stitch_patterns : [];
    const safeYarnQuantity = Array.isArray(selected.yarn_quantity) ? selected.yarn_quantity : [];

    // Generated pattern extras from parsed_guide
    const isGenerated = selected.source === 'generated';
    const genMetadata = isGenerated ? selected.parsed_guide?.metadata as Record<string, string> | null : null;
    const genAbbreviations = isGenerated ? selected.parsed_guide?.abbreviations as Record<string, string> | null : null;
    const genExtras = isGenerated ? selected.parsed_guide?.extras as Array<{ title: string; rows: [string, string][] }> | null : null;
    const genStitchPattern = isGenerated ? selected.parsed_guide?.stitchPattern as { title: string; layout: string; note: string } | null : null;
    const genStepDifficulty = selected.parsed_guide?.stepDifficulty as Record<string, string> | null | undefined;
    return (
      <div>
        <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 20 }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <input
            defaultValue={selected.name}
            onBlur={async (e) => {
              const newName = e.target.value.trim();
              if (newName && newName !== selected.name) {
                await supabase.from('patterns').update({ name: newName }).eq('id', selected.id);
                setSelected({ ...selected, name: newName });
              }
            }}
            style={{
              background: 'none', border: 'none', borderBottom: '1px solid transparent',
              color: 'var(--text-primary)', fontSize: 28, fontWeight: 700, padding: '2px 0',
              fontFamily: 'inherit', outline: 'none', flex: 1, cursor: 'text',
            }}
            onFocus={e => e.target.style.borderBottomColor = 'var(--primary)'}
            onBlurCapture={e => e.currentTarget.style.borderBottomColor = 'transparent'}
          />
        </div>
        {selected.designer && <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>by {selected.designer}</p>}

        {/* Meta grid */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(
            [
              ['Difficulty', selected.difficulty],
              ['Category', selected.category],
              ['Yarn Weight', selected.yarn_weight],
              ['Needles', selected.needle_size],
              selected.gauge_stitches != null
                ? ['Gauge', `${selected.gauge_stitches} sts${selected.gauge_rows != null ? ` × ${selected.gauge_rows} rows` : ''} ${selected.gauge_unit ?? 'per 10cm'}`]
                : null,
            ] as ([string, string | null] | null)[]
          ).filter((item): item is [string, string | null] => item !== null && item[1] !== null)
            .map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>{k}</p>
              <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Stitch patterns */}
        {safeStitchPatterns.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {safeStitchPatterns.map((sp, i) => (
              <span key={i} style={{ background: 'var(--bg-accent)', color: 'var(--primary)', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{sp}</span>
            ))}
          </div>
        )}

        {/* Colour variations */}
        {(() => {
          const variations = Array.isArray(selected.parsed_guide?.color_variations)
            ? (selected.parsed_guide!.color_variations as string[])
            : [];
          return variations.length > 0 ? (
            <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
              <p className="card-title" style={{ marginBottom: 10 }}>Colour Variations</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {variations.map((v, i) => (
                  <span key={i} style={{ background: 'var(--success-vivid-bg)', color: 'var(--success-vivid)', borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 600, border: '1px solid var(--success-vivid)' }}>🎨 {v}</span>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        {/* Yarn required */}
        {safeYarnQuantity.length > 0 && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 12 }}>Yarn Required</p>
            {safeYarnQuantity.filter(y => y.amount != null).map((y, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, paddingTop: 8, borderTop: i > 0 ? '1px solid var(--border-light)' : 'none', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, minWidth: 100 }}>{y.amount} {y.unit}</span>
                {y.size && <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>{y.size}</span>}
                {(y.color || y.note) && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{[y.color, y.note].filter(Boolean).join(' — ')}</span>}
              </div>
            ))}
          </div>
        )}

        {selected.notes && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 8 }}>Notes</p>
            <p style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6 }}>{selected.notes}</p>
          </div>
        )}

        {/* Generated pattern — extra metadata from parsed_guide */}
        {genMetadata && Object.keys(genMetadata).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
            {Object.entries(genMetadata)
              .filter(([k]) => !['Difficulty', 'Yarn weight', 'Needle size'].includes(k))
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, marginBottom: 3 }}>{k}</p>
                  <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }}>{v}</p>
                </div>
              ))}
          </div>
        )}

        {/* Generated pattern abbreviations */}
        {genAbbreviations && Object.keys(genAbbreviations).length > 0 && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 10 }}>Abbreviations</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
              {Object.entries(genAbbreviations).map(([abbrev, explanation]) => (
                <div key={abbrev} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 13, fontFamily: 'monospace', minWidth: 36 }}>{abbrev}</span>
                  <span style={{ color: 'var(--text-body)', fontSize: 13 }}>— {explanation}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated pattern extras (cable definitions etc.) */}
        {genExtras && genExtras.map((extra, i) => (
          <div key={i} className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 10 }}>{extra.title}</p>
            {extra.rows.map(([term, def], j) => (
              <div key={j} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, paddingTop: j > 0 ? 8 : 0, borderTop: j > 0 ? '1px solid var(--border-light)' : 'none' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{term}</span>
                <span style={{ color: 'var(--text-body)', fontSize: 14 }}>{def}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Generated pattern stitch layout */}
        {genStitchPattern && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 10 }}>{genStitchPattern.title}</p>
            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 14, marginBottom: 10, fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8, wordBreak: 'break-word', color: 'var(--text-body)' }}>
              {genStitchPattern.layout}
            </div>
            {genStitchPattern.note && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, borderLeft: '3px solid var(--primary)', paddingLeft: 12 }}>{genStitchPattern.note}</p>
            )}
          </div>
        )}

        {/* Pattern guide with hoverable abbreviations */}
        {sections && sections.length > 0 && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 12 }}>Pattern Guide</p>

            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
              {sections.map((sec, i) => (
                <button key={i} onClick={() => setActiveSection(i)} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid',
                  borderColor: activeSection === i ? 'var(--primary)' : 'var(--border-medium)',
                  background: activeSection === i ? 'var(--primary)' : 'transparent',
                  color: activeSection === i ? 'var(--primary-text)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
                }}>{sec.title}</button>
              ))}
            </div>

            <p style={{ color: 'var(--text-faint)', fontSize: 11, fontStyle: 'italic', marginBottom: 12 }}>
              Hover over highlighted abbreviations for definitions
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {getSteps(sections[activeSection]).map((step, j) => {
                const stepNumMatch = step.match(/^(\d+)\./);
                const stepNum = stepNumMatch ? stepNumMatch[1] : String(j + 1);
                const effectiveDifficulty = stepDifficulty(genStepDifficulty, sections[activeSection].title, stepNum, selected.difficulty);
                return (
                  <div key={j} style={{
                    background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px',
                    fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)',
                    borderLeft: `3px solid ${difficultyColor(effectiveDifficulty)}`,
                  }}>
                    <StepText step={step} index={j} />
                  </div>
                );
              })}
            </div>

            {/* Section nav */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {activeSection > 0 && (
                <button className="btn btn-secondary" onClick={() => setActiveSection(s => s - 1)}>← Previous</button>
              )}
              {activeSection < sections.length - 1 && (
                <button className="btn btn-primary" onClick={() => setActiveSection(s => s + 1)}>Next →</button>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => openNewProject(selected)}>
            ▶ Start a Project
          </button>

          <button className="btn btn-secondary"
            onClick={() => reparsePdfRef.current?.click()}
            disabled={parsing}
            style={{ opacity: parsing ? 0.6 : 1 }}>
            {parsing ? 'Parsing…' : sections && sections.length > 0 ? '📄 Re-parse PDF instructions' : '📄 Add PDF instructions'}
          </button>
          <input ref={reparsePdfRef} type="file" accept="application/pdf"
            style={{ display: 'none' }} onChange={handleReparsePdf} />
        </div>

        <button onClick={async () => {
          if (!confirm('Delete this pattern?')) return;
          await supabase.from('patterns').delete().eq('id', selected.id);
          setView('list');
        }} style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid var(--danger-vivid)', background: 'transparent', color: 'var(--danger-vivid)', cursor: 'pointer' }}>
          Delete Pattern
        </button>
      </div>
    );
  }

  // ── New pattern form ─────────────────────────────────────────────────────────
  if (view === 'new') {
    return (
      <div>
        <button className="btn btn-secondary" onClick={() => { setView('list'); resetForm(); }} style={{ marginBottom: 20 }}>← Back</button>
        <h1>Add Pattern</h1>

        <div style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
          {(['manual', 'ravelry', 'pdf'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} className="btn"
              style={{ background: mode === m ? 'var(--primary)' : 'var(--bg-input)', color: mode === m ? 'var(--primary-text)' : 'var(--text-muted)', border: `1px solid ${mode === m ? 'var(--primary)' : 'var(--border-medium)'}` }}>
              {m === 'manual' ? '✏️ Manual' : m === 'ravelry' ? '🧶 Ravelry' : '📄 PDF'}
            </button>
          ))}
        </div>

        {mode === 'ravelry' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={{ ...fi.input, flex: 1 }} value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="Search Ravelry patterns..." />
              <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
                {searching ? '…' : 'Search'}
              </button>
            </div>
            {searchResults.map(r => (
              <div key={r.id} onClick={() => pickRavelry(r)} style={{
                background: selectedRavelry?.id === r.id ? 'var(--bg-accent)' : 'var(--bg-card)',
                border: `1px solid ${selectedRavelry?.id === r.id ? 'var(--primary)' : 'var(--border-light)'}`,
                borderRadius: 8, padding: 12, marginBottom: 6, cursor: 'pointer',
              }}>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.name}</p>
                {r.designer && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>by {r.designer.name}</p>}
              </div>
            ))}
            {ravelryMapped && <p style={{ color: 'var(--success-vivid)', fontSize: 13, marginTop: 8 }}>✓ Metadata loaded from Ravelry</p>}
          </div>
        )}

        {mode === 'pdf' && (
          <div style={{ marginBottom: 20 }}>
            <input ref={fileInputRef} type="file" accept="application/pdf"
              style={{ display: 'none' }} onChange={handlePdfUpload} />
            <div onClick={() => !parsing && fileInputRef.current?.click()} style={{
              border: '2px dashed var(--border-medium)', borderRadius: 12, padding: 40,
              textAlign: 'center', cursor: parsing ? 'default' : 'pointer',
              background: 'var(--bg-card)', marginBottom: 12,
            }}>
              {parsing ? (
                <><p style={{ color: 'var(--primary)', fontSize: 15, fontWeight: 600 }}>Parsing with Claude…</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>This may take a moment</p></>
              ) : pdfName ? (
                <><p style={{ color: 'var(--success-vivid)', fontSize: 15, fontWeight: 600 }}>✓ {pdfName}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Click to choose a different file</p></>
              ) : (
                <><p style={{ color: 'var(--text-muted)', fontSize: 20, marginBottom: 8 }}>📄</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Click to upload a PDF pattern</p>
                  <p style={{ color: 'var(--text-faint)', fontSize: 13, marginTop: 4 }}>Claude will parse the instructions automatically</p></>
              )}
            </div>
            {parsedGuide && <p style={{ color: 'var(--success-vivid)', fontSize: 13 }}>✓ Pattern parsed — review the fields below and save</p>}
          </div>
        )}

        {[
          ['Pattern Name *', name, setName, 'e.g. Hermione\'s Everyday Socks'],
          ['Designer', designer, setDesigner, 'Designer name'],
          ['Category', category, setCategory, 'e.g. Socks, Sweater, Hat'],
          ['Yarn Weight', yarnWeight, setYarnWeight, 'e.g. DK, Worsted'],
          ['Needle Size', needleSize, setNeedleSize, 'e.g. 4mm, US 6'],
        ].map(([label, value, setter, placeholder]) => (
          <div key={label as string} style={fi.field}>
            <label style={fi.label}>{label as string}</label>
            <input style={fi.input} value={value as string}
              onChange={e => (setter as (v: string) => void)(e.target.value)}
              placeholder={placeholder as string} />
          </div>
        ))}

        <div style={fi.field}>
          <label style={fi.label}>Notes</label>
          <textarea style={{ ...fi.input, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
        </div>

        <button className="btn btn-primary" onClick={saveNew}
          disabled={saving || (!name.trim() && mode !== 'pdf') || (mode === 'pdf' && parsing)}
          style={{ marginTop: 8, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Pattern'}
        </button>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  const filteredPatterns = patterns.filter(p =>
    !listSearch.trim() ||
    p.name.toLowerCase().includes(listSearch.toLowerCase()) ||
    (p.designer ?? '').toLowerCase().includes(listSearch.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(listSearch.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h1>Patterns</h1>
        <button className="btn btn-primary" onClick={() => setView('new')}>+ Add Pattern</button>
      </div>
      <input
        value={listSearch}
        onChange={e => setListSearch(e.target.value)}
        placeholder="Search patterns…"
        style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-body)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
      />
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : filteredPatterns.length === 0 ? (
        <p className="empty">{listSearch ? 'No matching patterns.' : 'No patterns yet.'}</p>
      ) : (
        filteredPatterns.map(p => (
          <div key={p.id} className="card" onClick={() => { setSelected(p); setView('detail'); }}>
            <div className="card-row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20 }}>{sourceIcon[p.source] ?? '📌'}</span>
              <div style={{ flex: 1 }}>
                <p className="card-title">{p.name}</p>
                {p.designer && <p className="card-sub">by {p.designer}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {p.difficulty && <span style={{ color: 'var(--text-accent)', fontSize: 12 }}>{p.difficulty}</span>}
                  {(p.category || p.yarn_weight) && (
                    <span className="card-meta">{[p.category, p.yarn_weight].filter(Boolean).join(' · ')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const fi = {
  field: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 6 } as React.CSSProperties,
  input: {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)',
    borderRadius: 8, padding: '10px 12px', color: 'var(--text-body)', fontSize: 15,
    boxSizing: 'border-box',
  } as React.CSSProperties,
};
