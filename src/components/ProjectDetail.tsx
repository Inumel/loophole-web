import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import StepText from './StepText';
import ProjectPhotos from './ProjectPhotos';
import { difficultyColor, stepDifficulty } from '../lib/theme';

type Project = {
  id: string;
  name: string;
  status: string;
  current_row: number;
  started_at: string | null;
  notes: string | null;
  chosen_size: string | null;
  chosen_color_variation: string | null;
  pattern: { name: string; difficulty: string | null; parsed_guide: Record<string, unknown> | null } | null;
};

type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
};

type GuideSection = {
  title: string;
  steps?: string[];
  steps_by_size?: Record<string, unknown>;
  steps_by_variation?: Record<string, unknown>;
};

type StepProgress = {
  section_index: number;
  step_index: number;
  completed: boolean;
};

type ProjectYarn = {
  id: string;
  yarn_name: string | null;
  quantity_used: number | null;
  unit: string;
  yarn: { name: string; brand: string | null; color_hex: string | null }[] | null;
};

type StashYarn = {
  id: string;
  name: string;
  brand: string | null;
  color_hex: string | null;
  quantity: number | null;
  unit: string;
};

type Props = { projectId: string; onBack: () => void; readOnly?: boolean };

function getSteps(sec: GuideSection, chosenSize: string | null, chosenVariation: string | null = null): string[] {
  // If a variation is chosen and this section has variation-specific steps, use those
  if (chosenVariation && sec.steps_by_variation?.[chosenVariation]) {
    const val = sec.steps_by_variation[chosenVariation];
    if (Array.isArray(val)) return val as string[];
    if (val && typeof val === 'object') return Object.values(val as object) as string[];
  }
  if (sec.steps_by_size && Object.keys(sec.steps_by_size).length > 0) {
    if (chosenSize && sec.steps_by_size[chosenSize]) {
      const val = sec.steps_by_size[chosenSize];
      return Array.isArray(val) ? val as string[] : [];
    }
    const firstKey = Object.keys(sec.steps_by_size)[0];
    const val = firstKey ? sec.steps_by_size[firstKey] : [];
    return Array.isArray(val) ? val as string[] : [];
  }
  if (Array.isArray(sec.steps)) return sec.steps;
  if (typeof sec.steps === 'string') return [sec.steps];
  return [];
}

const UNITS = ['g', 'oz', 'yards', 'meters', 'skeins'];

export default function ProjectDetail({ projectId, onBack, readOnly = false }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [stepProgress, setStepProgress] = useState<StepProgress[]>([]);
  const completedStepsCountRef = useRef(0);
  const [projectYarns, setProjectYarns] = useState<ProjectYarn[]>([]);
  const [stashYarns, setStashYarns] = useState<StashYarn[]>([]);
  const [showYarnModal, setShowYarnModal] = useState(false);
  const [selectedStashYarn, setSelectedStashYarn] = useState<StashYarn | null>(null);
  const [quantityUsed, setQuantityUsed] = useState('');
  const [yarnUnit, setYarnUnit] = useState('g');
  const [savingYarn, setSavingYarn] = useState(false);

  // Edit
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartedAt, setEditStartedAt] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Completion
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionRating, setCompletionRating] = useState(0);
  const [savingCompletion, setSavingCompletion] = useState(false);

  useEffect(() => {
    fetchProject();
    fetchSessions();
    fetchProjectYarns();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [projectId]);

  async function fetchProject() {
    const { data } = await supabase
      .from('projects')
      .select('*, pattern:patterns(name, difficulty, parsed_guide)')
      .eq('id', projectId).single();
    if (data) { setProject(data); setNotes(data.notes ?? ''); }
    setLoading(false);
    if (data?.pattern_id) fetchStepProgress(data.id);
  }

  async function fetchSessions() {
    const { data } = await supabase.from('knitting_sessions')
      .select('id, started_at, ended_at, duration_minutes')
      .eq('project_id', projectId).order('started_at', { ascending: false }).limit(10);
    if (data) setSessions(data);
  }

  async function fetchStepProgress(pid: string) {
    const { data } = await supabase.from('project_step_progress')
      .select('section_index, step_index, completed').eq('project_id', pid);
    if (data) {
      setStepProgress(data);
      completedStepsCountRef.current = data.filter(p => p.completed).length;
    }
  }

  async function fetchProjectYarns() {
    const { data } = await supabase.from('project_yarn')
      .select('id, yarn_name, quantity_used, unit, yarn:yarn_stash(name, brand, color_hex)')
      .eq('project_id', projectId);
    if (data) setProjectYarns(data);
  }

  async function openYarnModal() {
    const { data } = await supabase.from('yarn_catalog')
      .select('id, name, brand, color_hex, stash:yarn_stash(id, quantity, unit, status)')
      .order('name');
    // Flatten to stash entries for display, keeping catalog info
    const flat = (data ?? []).flatMap(c =>
      (c.stash as Array<{ id: string; quantity: number | null; unit: string; status: string }>).map(s => ({
        id: s.id,
        name: c.name,
        brand: c.brand,
        color_hex: c.color_hex,
        quantity: s.quantity,
        unit: s.unit,
        status: s.status,
      }))
    );
    // If no stash entries, show catalog items anyway
    if (flat.length > 0) {
      setStashYarns(flat);
    } else {
      setStashYarns((data ?? []).map(c => ({
        id: c.id, name: c.name, brand: c.brand,
        color_hex: c.color_hex, quantity: null, unit: 'g', status: 'in_stock',
      })));
    }
    setSelectedStashYarn(null); setQuantityUsed(''); setYarnUnit('g');
    setShowYarnModal(true);
  }

  async function addYarn() {
    if (!selectedStashYarn) return;
    setSavingYarn(true);
    await supabase.from('project_yarn').insert({
      project_id: projectId, yarn_stash_id: selectedStashYarn.id,
      yarn_name: selectedStashYarn.name,
      quantity_used: quantityUsed ? parseFloat(quantityUsed) : null, unit: yarnUnit,
    });
    setSavingYarn(false);
    setShowYarnModal(false);
    fetchProjectYarns();
  }

  async function toggleStep(si: number, ti: number) {
    const existing = stepProgress.find(p => p.section_index === si && p.step_index === ti);
    const newCompleted = !(existing?.completed ?? false);
    setStepProgress(prev => [
      ...prev.filter(p => !(p.section_index === si && p.step_index === ti)),
      { section_index: si, step_index: ti, completed: newCompleted },
    ]);
    await supabase.from('project_step_progress').upsert({
      project_id: projectId, section_index: si, step_index: ti,
      completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null,
    }, { onConflict: 'project_id,section_index,step_index' });

    // Step counter: current_row mirrors the count of completed steps across the
    // whole project, so it stays in sync everywhere current_row is displayed
    // (project list cards, etc.) without those views needing their own logic.
    if (project) {
      const newCount = newCompleted
        ? completedStepsCountRef.current + 1
        : Math.max(0, completedStepsCountRef.current - 1);
      completedStepsCountRef.current = newCount;
      await supabase.from('projects').update({ current_row: newCount }).eq('id', projectId);
      setProject(prev => prev ? { ...prev, current_row: newCount } : prev);
    }
  }

  function isCompleted(si: number, ti: number) {
    return stepProgress.find(p => p.section_index === si && p.step_index === ti)?.completed ?? false;
  }

  function sectionProg(si: number, total: number) {
    return stepProgress.filter(p => p.section_index === si && p.completed).length;
  }

  async function startTimer() {
    const { data } = await supabase.from('knitting_sessions')
      .insert({ project_id: projectId, started_at: new Date().toISOString() }).select().single();
    if (!data) return;
    setActiveSessionId(data.id); setTimerSeconds(0); setTimerRunning(true);
    timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
  }

  async function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    if (!activeSessionId) return;
    await supabase.from('knitting_sessions').update({
      ended_at: new Date().toISOString(),
      duration_minutes: parseFloat((timerSeconds / 60).toFixed(2)),
    }).eq('id', activeSessionId);
    setActiveSessionId(null); setTimerSeconds(0); fetchSessions();
  }

  function fmt(secs: number) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  function totalTime() {
    const total = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    const h = Math.floor(total / 60), m = Math.round(total % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  async function saveNotes() {
    await supabase.from('projects').update({ notes }).eq('id', projectId);
  }

  async function setStatus(status: string) {
    if (!project) return;
    if (status === 'completed') {
      setCompletionNotes('');
      setCompletionRating(0);
      setShowCompletionModal(true);
      return;
    }
    await supabase.from('projects').update({ status }).eq('id', projectId);
    setProject({ ...project, status });
  }

  async function saveCompletion() {
    if (!project) return;
    setSavingCompletion(true);
    await supabase.from('projects').update({
      status: 'completed',
      completed_at: new Date().toISOString().split('T')[0],
      completion_notes: completionNotes || null,
      rating: completionRating || null,
    }).eq('id', projectId);
    setSavingCompletion(false);
    setShowCompletionModal(false);
    setProject({ ...project, status: 'completed' });
  }

  function openEdit() {
    if (!project) return;
    setEditName(project.name);
    setEditStartedAt(project.started_at ?? '');
    setShowEditModal(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setSavingEdit(true);
    await supabase.from('projects').update({
      name: editName.trim(),
      started_at: editStartedAt || null,
    }).eq('id', projectId);
    setSavingEdit(false);
    setShowEditModal(false);
    fetchProject();
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (!project) return <p style={{ color: 'var(--text-muted)' }}>Project not found.</p>;

  const rawSections = project.pattern?.parsed_guide?.sections;
  const sections = Array.isArray(rawSections) ? (rawSections as GuideSection[]) : null;
  const genStepDifficulty = project.pattern?.parsed_guide?.stepDifficulty as Record<string, string> | null | undefined;
  const totalSteps = sections?.reduce((sum, s) => sum + getSteps(s, project.chosen_size, project.chosen_color_variation).length, 0) ?? 0;
  const completedSteps = stepProgress.filter(p => p.completed).length;
  const stepProgressPct = totalSteps > 0 ? Math.min(100, (completedSteps / totalSteps) * 100) : null;

  return (
    <div>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 20 }}>← Back</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{project.name}</h1>
        {!readOnly && <button onClick={openEdit} style={{ background: 'var(--bg-muted)', border: 'none', color: 'var(--text-accent)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>✏️ Edit</button>}
      </div>
      {project.pattern && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
          Pattern: {project.pattern.name}{project.chosen_size && project.chosen_size !== 'One Size' ? ` · Size: ${project.chosen_size}` : ''}
        </p>
      )}

      {/* Status */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {['active', 'paused', 'completed', 'frogged'].map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              padding: '6px 14px', borderRadius: 20,
              border: `1px solid ${project.status === s ? 'var(--primary)' : 'var(--border-medium)'}`,
              background: project.status === s ? 'var(--primary)' : 'transparent',
              color: project.status === s ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
            }}>{s}</button>
          ))}
        </div>
      )}
      {readOnly && (
        <div style={{ marginBottom: 24 }}>
          <span style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>{project.status}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Step counter — driven by step completion in the Pattern Guide below; no manual adjustment */}
        <div className="card" style={{ cursor: 'default' }}>
          <p className="card-title" style={{ marginBottom: 16 }}>Step Counter</p>
          {sections && sections.length > 0 ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 52, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{completedSteps}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>of {totalSteps} steps</p>
              </div>
              {stepProgressPct !== null && (
                <div style={{ height: 6, background: 'var(--bg-muted)', borderRadius: 3, marginTop: 16, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stepProgressPct}%`, background: 'var(--primary)', borderRadius: 3 }} />
                </div>
              )}
              <p style={{ color: 'var(--text-faint)', fontSize: 11, textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>Tap a step below to mark it complete</p>
            </>
          ) : (
            <p style={{ color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>Link a pattern with steps to track progress here.</p>
          )}
        </div>

        {/* Timer */}
        <div className="card" style={{ cursor: 'default' }}>
          <p className="card-title" style={{ marginBottom: 16 }}>Timer</p>
          {timerRunning && (
            <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>
              {fmt(timerSeconds)}
            </p>
          )}
          {!readOnly && <button onClick={timerRunning ? stopTimer : startTimer} className="btn"
            style={{ width: '100%', background: timerRunning ? 'var(--danger-vivid)' : 'var(--success-vivid)', color: '#fff' }}>
            {timerRunning ? '⏹ Stop' : '▶ Start Session'}
          </button>}
          {sessions.length > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>Total: {totalTime()}</p>
          )}
          {sessions.slice(0, 4).map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', marginTop: 6, paddingTop: 6 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(s.started_at).toLocaleDateString()}</span>
              <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>{s.duration_minutes ? `${Math.round(s.duration_minutes)}m` : 'in progress'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pattern guide */}
      {sections && sections.length > 0 && (
        <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p className="card-title">Pattern Guide</p>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{completedSteps}/{totalSteps} steps</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-muted)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%`, background: 'var(--primary)', borderRadius: 3 }} />
          </div>
          {/* Section tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
            {sections.map((sec, i) => {
              const comp = sectionProg(i, getSteps(sec, project.chosen_size, project.chosen_color_variation).length);
              const total = getSteps(sec, project.chosen_size, project.chosen_color_variation).length;
              const done = comp === total;
              return (
                <button key={i} onClick={() => setActiveSection(i)} style={{
                  padding: '6px 12px', borderRadius: 8, border: `1px solid ${activeSection === i ? 'var(--primary)' : done ? 'var(--success-vivid)' : 'var(--border-medium)'}`,
                  background: activeSection === i ? 'var(--primary)' : 'transparent',
                  color: activeSection === i ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {done ? '✓ ' : ''}{sec.title} ({comp}/{total})
                </button>
              );
            })}
          </div>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, textAlign: 'center', marginBottom: 10, fontStyle: 'italic' }}>Click to complete a step</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {getSteps(sections[activeSection], project.chosen_size, project.chosen_color_variation).map((step, si) => {
              const done = isCompleted(activeSection, si);
              const stepNumMatch = step.match(/^(\d+)\./);
              const stepNum = stepNumMatch ? stepNumMatch[1] : String(si + 1);
              const effectiveDifficulty = stepDifficulty(genStepDifficulty, sections[activeSection].title, stepNum, project.pattern?.difficulty);
              return (
                <div key={si} onClick={() => toggleStep(activeSection, si)} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  background: done ? 'var(--success-vivid-bg)' : 'var(--bg-muted)',
                  borderLeft: `3px solid ${done ? 'var(--success-vivid)' : difficultyColor(effectiveDifficulty)}`,
                  borderRadius: 10, padding: 12, cursor: 'pointer', opacity: done ? 0.8 : 1,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12, border: `2px solid ${done ? 'var(--success-vivid)' : 'var(--text-faint)'}`,
                    background: done ? 'var(--success-vivid)' : 'transparent', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </div>
                  <p style={{ color: done ? 'var(--text-faint)' : 'var(--text-body)', fontSize: 14, lineHeight: 1.5, flex: 1, textDecoration: done ? 'line-through' : 'none', margin: 0 }} className="step-container">
                    <StepText step={step} index={si} />
                  </p>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {activeSection > 0 && (
              <button className="btn btn-secondary" onClick={() => setActiveSection(s => s - 1)} style={{ flex: 1 }}>← Previous</button>
            )}
            {activeSection < sections.length - 1 && (
              <button className="btn btn-primary" onClick={() => setActiveSection(s => s + 1)} style={{ flex: 1 }}>Next →</button>
            )}
          </div>
        </div>
      )}

      {/* Yarn */}
      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p className="card-title">Yarn</p>
        {!readOnly && <button onClick={openYarnModal} style={{ background: 'var(--bg-muted)', border: 'none', color: 'var(--text-accent)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>+ Add</button>}
        </div>
        {projectYarns.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic' }}>No yarn linked yet.</p>
        ) : projectYarns.map(py => (
          <div key={py.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border-light)' }}>
            <div style={{ width: 20, height: 20, borderRadius: 10, background: py.yarn?.[0]?.color_hex ?? 'var(--neutral-vivid)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{py.yarn?.[0]?.name ?? py.yarn_name ?? 'Unknown'}</p>
            {py.yarn?.[0]?.brand && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{py.yarn[0].brand}</p>}
            </div>
            {py.quantity_used != null && <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>{py.quantity_used} {py.unit}</span>}
          </div>
        ))}
      </div>

      {/* Photos */}
      <ProjectPhotos projectId={projectId} readOnly={readOnly} />

      {/* Notes */}
      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <p className="card-title" style={{ marginBottom: 12 }}>Notes</p>
        <textarea value={notes} onChange={(e) => !readOnly && setNotes(e.target.value)} onBlur={() => !readOnly && saveNotes()} rows={4}
          placeholder="Notes about this project..."
          readOnly={readOnly}
          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: 10, color: 'var(--text-body)', fontSize: 14, resize: readOnly ? 'none' : 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', opacity: readOnly ? 0.6 : 1 }} />
        {!readOnly && <button className="btn btn-secondary" onClick={saveNotes} style={{ marginTop: 8 }}>Save Notes</button>}
      </div>

      {!readOnly && <button onClick={async () => {
        if (!confirm('Delete this project?')) return;
        await supabase.from('projects').delete().eq('id', projectId);
        onBack();
      }} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--danger-vivid)', background: 'transparent', color: 'var(--danger-vivid)', cursor: 'pointer', fontSize: 14 }}>
        Delete Project
      </button>}

      {/* Edit modal */}
      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>Edit Project</p>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {[['Project Name *', editName, setEditName, 'text', 'Project name'],
              ['Start Date', editStartedAt, setEditStartedAt, 'date', ''],
            ].map(([label, value, setter, type, placeholder]) => (
              <div key={label as string} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>{label as string}</label>
                <input
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-body)', fontSize: 15, boxSizing: 'border-box' }}
                  value={value as string}
                  onChange={e => (setter as (v: string) => void)(e.target.value)}
                  type={type as string}
                  placeholder={placeholder as string}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={saveEdit}
                disabled={savingEdit || !editName.trim()}
                style={{ flex: 1, opacity: savingEdit ? 0.6 : 1 }}>
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Completion modal */}
      {showCompletionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>🎉 Project Complete!</p>
              <button onClick={() => setShowCompletionModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>How did it go? (optional)</label>
            <textarea
              value={completionNotes}
              onChange={e => setCompletionNotes(e.target.value)}
              placeholder="Any notes about the finished project…"
              rows={3}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: 10, color: 'var(--text-body)', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>Rating</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {[1,2,3,4,5].map(star => (
                <button key={star} onClick={() => setCompletionRating(star)}
                  style={{ background: 'none', border: 'none', fontSize: 32, cursor: 'pointer', opacity: star <= completionRating ? 1 : 0.3 }}>⭐</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveCompletion}
                disabled={savingCompletion}
                style={{ flex: 1, background: 'var(--success-vivid)', opacity: savingCompletion ? 0.6 : 1 }}>
                {savingCompletion ? 'Saving…' : 'Mark as Complete'}
              </button>
              <button className="btn btn-secondary" onClick={async () => {
                if (!project) return;
                await supabase.from('projects').update({ status: 'completed', completed_at: new Date().toISOString().split('T')[0] }).eq('id', projectId);
                setProject({ ...project, status: 'completed' });
                setShowCompletionModal(false);
              }} style={{ flex: 1 }}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {/* Yarn modal */}
      {showYarnModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-sidebar)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 600, maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>Add Yarn</p>
              <button onClick={() => setShowYarnModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>Select from stash</p>
            <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
              {stashYarns.map(y => (
                <div key={y.id} onClick={() => { setSelectedStashYarn(y); setYarnUnit(y.unit); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', background: selectedStashYarn?.id === y.id ? 'var(--bg-accent)' : 'transparent', borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: y.color_hex ?? 'var(--neutral-vivid)' }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{y.name}</p>
                    {y.brand && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{y.brand}</p>}
                  </div>
                  {y.quantity != null && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{y.quantity} {y.unit}</span>}
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>Quantity used (optional)</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <input value={quantityUsed} onChange={(e) => setQuantityUsed(e.target.value)} type="number" placeholder="0"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-body)', fontSize: 15, width: 100 }} />
              {UNITS.map(u => (
                <button key={u} onClick={() => setYarnUnit(u)}
                  style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid', borderColor: yarnUnit === u ? 'var(--primary)' : 'var(--border-medium)', background: yarnUnit === u ? 'var(--primary)' : 'transparent', color: yarnUnit === u ? 'var(--primary-text)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                  {u}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addYarn} disabled={savingYarn || !selectedStashYarn} style={{ width: '100%', opacity: savingYarn || !selectedStashYarn ? 0.6 : 1 }}>
              {savingYarn ? 'Adding…' : 'Add to Project'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
