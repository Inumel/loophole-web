import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { searchRavelryPatterns, getRavelryPattern, mapRavelryPattern } from '../lib/ravelry';
import { parsePatternWithClaude } from '../lib/claude';
import StepText from '../components/StepText';

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

const sourceIcon: Record<string, string> = { ravelry: '🧶', pdf: '📄', manual: '✏️' };

function getSteps(sec: { steps?: string[]; steps_by_size?: Record<string, string[]> }): string[] {
  if (sec.steps_by_size) {
    const firstKey = Object.keys(sec.steps_by_size)[0];
    return firstKey ? sec.steps_by_size[firstKey] : [];
  }
  return sec.steps ?? [];
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
  const [newProjectTargetRows, setNewProjectTargetRows] = useState('');
  const [availableSizes, setAvailableSizes] = useState<string[]>([]);
  const [chosenSize, setChosenSize] = useState('');
  const [savingProject, setSavingProject] = useState(false);
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
    setAvailableSizes(sizes ?? []);
    const firstSize = sizes?.length === 1 ? sizes[0] : '';
    setChosenSize(firstSize);
    const sizeSuffix = firstSize && firstSize !== 'One Size' ? ` - ${firstSize}` : '';
    setNewProjectName(`${pattern.name}${sizeSuffix}`);
    setView('new-project');
  }

  async function saveProject() {
    if (!newProjectName.trim() || !selected) return;
    if (availableSizes.length > 1 && !chosenSize) { alert('Please choose a size.'); return; }
    setSavingProject(true);
    await supabase.from('projects').insert({
      name: newProjectName.trim(),
      pattern_id: selected.id,
      chosen_size: chosenSize || (availableSizes[0] ?? null),
      target_rows: newProjectTargetRows ? parseInt(newProjectTargetRows) : null,
      status: 'active', current_row: 0,
      started_at: new Date().toISOString().split('T')[0],
    });
    setSavingProject(false);
    setView('detail');
  }

  // ── New project view ─────────────────────────────────────────────────────────
  if (view === 'new-project' && selected) {
    return (
      <div style={{ maxWidth: 500 }}>
        <button className="btn btn-secondary" onClick={() => setView('detail')} style={{ marginBottom: 20 }}>← Back</button>
        <h1>Start a Project</h1>
        <p style={{ color: '#9CA3AF', marginBottom: 20, fontSize: 14 }}>Pattern: {selected.name}</p>

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
                  borderColor: chosenSize === s ? '#7C3AED' : '#374151',
                  background: chosenSize === s ? '#7C3AED' : 'transparent',
                  color: chosenSize === s ? '#fff' : '#9CA3AF', cursor: 'pointer', fontSize: 14,
                }}>{s}</button>
              ))}
            </div>
            {chosenSize && <p style={{ color: '#10B981', fontSize: 12, marginTop: 8 }}>✓ Steps will be shown for size: {chosenSize}</p>}
          </div>
        )}

        <div style={fi.field}>
          <label style={fi.label}>Target Rows (optional)</label>
          <input style={fi.input} value={newProjectTargetRows}
            onChange={e => setNewProjectTargetRows(e.target.value)} type="number" placeholder="e.g. 220" />
        </div>

        <button className="btn btn-primary" onClick={saveProject}
          disabled={savingProject || !newProjectName.trim() || (availableSizes.length > 1 && !chosenSize)}
          style={{ marginTop: 8, opacity: savingProject ? 0.6 : 1 }}>
          {savingProject ? 'Creating…' : 'Create Project'}
        </button>
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
    return (
      <div>
        <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 20 }}>← Back</button>
        <h1 style={{ marginBottom: 4 }}>{selected.name}</h1>
        {selected.designer && <p style={{ color: '#9CA3AF', marginBottom: 12 }}>by {selected.designer}</p>}

        {/* Meta grid */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(
            [
              ['Difficulty', selected.difficulty],
              ['Category', selected.category],
              ['Yarn Weight', selected.yarn_weight],
              ['Needles', selected.needle_size],
              selected.gauge_stitches != null
                ? ['Gauge', `${selected.gauge_stitches} sts × ${selected.gauge_rows} rows ${selected.gauge_unit ?? 'per 10cm'}`]
                : null,
            ] as ([string, string | null] | null)[]
          ).filter((item): item is [string, string | null] => item !== null && item[1] !== null)
            .map(([k, v]) => (
            <div key={k} style={{ background: '#1F2937', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}>
              <p style={{ color: '#6B7280', fontSize: 11, marginBottom: 2 }}>{k}</p>
              <p style={{ color: '#F9FAFB', fontSize: 14, fontWeight: 600 }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Stitch patterns */}
        {safeStitchPatterns.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {safeStitchPatterns.map((sp, i) => (
              <span key={i} style={{ background: '#2D1B6B', color: '#A78BFA', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{sp}</span>
            ))}
          </div>
        )}

        {/* Yarn required */}
        {safeYarnQuantity.length > 0 && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 12 }}>Yarn Required</p>
            {safeYarnQuantity.filter(y => y.amount != null).map((y, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, paddingTop: 8, borderTop: i > 0 ? '1px solid #374151' : 'none', flexWrap: 'wrap' }}>
                <span style={{ color: '#F9FAFB', fontWeight: 700, minWidth: 100 }}>{y.amount} {y.unit}</span>
                {y.size && <span style={{ color: '#7C3AED', fontSize: 13, fontWeight: 600 }}>{y.size}</span>}
                {(y.color || y.note) && <span style={{ color: '#9CA3AF', fontSize: 13 }}>{[y.color, y.note].filter(Boolean).join(' — ')}</span>}
              </div>
            ))}
          </div>
        )}

        {selected.notes && (
          <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
            <p className="card-title" style={{ marginBottom: 8 }}>Notes</p>
            <p style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 1.6 }}>{selected.notes}</p>
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
                  borderColor: activeSection === i ? '#7C3AED' : '#374151',
                  background: activeSection === i ? '#7C3AED' : 'transparent',
                  color: activeSection === i ? '#fff' : '#9CA3AF',
                  cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
                }}>{sec.title}</button>
              ))}
            </div>

            <p style={{ color: '#4B5563', fontSize: 11, fontStyle: 'italic', marginBottom: 12 }}>
              Hover over highlighted abbreviations for definitions
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {getSteps(sections[activeSection]).map((step, j) => (
                <div key={j} style={{ background: '#374151', borderRadius: 8, padding: '10px 14px', fontSize: 14, lineHeight: 1.6, color: '#D1D5DB' }}>
                  <StepText step={step} index={j} />
                </div>
              ))}
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
        }} style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
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
              style={{ background: mode === m ? '#7C3AED' : '#374151', color: '#fff' }}>
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
                background: selectedRavelry?.id === r.id ? '#2D1B6B' : '#1F2937',
                border: `1px solid ${selectedRavelry?.id === r.id ? '#7C3AED' : 'transparent'}`,
                borderRadius: 8, padding: 12, marginBottom: 6, cursor: 'pointer',
              }}>
                <p style={{ color: '#F9FAFB', fontWeight: 600 }}>{r.name}</p>
                {r.designer && <p style={{ color: '#9CA3AF', fontSize: 13 }}>by {r.designer.name}</p>}
              </div>
            ))}
            {ravelryMapped && <p style={{ color: '#10B981', fontSize: 13, marginTop: 8 }}>✓ Metadata loaded from Ravelry</p>}
          </div>
        )}

        {mode === 'pdf' && (
          <div style={{ marginBottom: 20 }}>
            <input ref={fileInputRef} type="file" accept="application/pdf"
              style={{ display: 'none' }} onChange={handlePdfUpload} />
            <div onClick={() => !parsing && fileInputRef.current?.click()} style={{
              border: '2px dashed #374151', borderRadius: 12, padding: 40,
              textAlign: 'center', cursor: parsing ? 'default' : 'pointer',
              background: '#1F2937', marginBottom: 12,
            }}>
              {parsing ? (
                <><p style={{ color: '#A78BFA', fontSize: 15, fontWeight: 600 }}>Parsing with Claude…</p>
                  <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>This may take a moment</p></>
              ) : pdfName ? (
                <><p style={{ color: '#10B981', fontSize: 15, fontWeight: 600 }}>✓ {pdfName}</p>
                  <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>Click to choose a different file</p></>
              ) : (
                <><p style={{ color: '#9CA3AF', fontSize: 20, marginBottom: 8 }}>📄</p>
                  <p style={{ color: '#9CA3AF', fontSize: 15 }}>Click to upload a PDF pattern</p>
                  <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>Claude will parse the instructions automatically</p></>
              )}
            </div>
            {parsedGuide && <p style={{ color: '#10B981', fontSize: 13 }}>✓ Pattern parsed — review the fields below and save</p>}
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
  return (
    <div>
      <div className="page-header">
        <h1>Patterns</h1>
        <button className="btn btn-primary" onClick={() => setView('new')}>+ Add Pattern</button>
      </div>
      {loading ? <p style={{ color: '#9CA3AF' }}>Loading…</p> : patterns.length === 0 ? (
        <p className="empty">No patterns yet.</p>
      ) : (
        patterns.map(p => (
          <div key={p.id} className="card" onClick={() => { setSelected(p); setView('detail'); }}>
            <div className="card-row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20 }}>{sourceIcon[p.source] ?? '📌'}</span>
              <div style={{ flex: 1 }}>
                <p className="card-title">{p.name}</p>
                {p.designer && <p className="card-sub">by {p.designer}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {p.difficulty && <span style={{ color: '#A78BFA', fontSize: 12 }}>{p.difficulty}</span>}
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
  label: { display: 'block', color: '#9CA3AF', fontSize: 13, fontWeight: 500, marginBottom: 6 } as React.CSSProperties,
  input: {
    width: '100%', background: '#1F2937', border: '1px solid #374151',
    borderRadius: 8, padding: '10px 12px', color: '#F9FAFB', fontSize: 15,
    boxSizing: 'border-box',
  } as React.CSSProperties,
};
