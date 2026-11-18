import { ChevronDown, ChevronRight, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { TEMPLATE_COLORS, TEMPLATE_ICONS, templateAppearance } from '../utils/templateAppearance';
import { TrainingTemplateIcon } from './TrainingTemplateIcon';
import { ExerciseSelector } from './ExerciseSelector';
import { exerciseLabel } from '../utils/exerciseCatalog';
export { TrainingTemplateIcon } from './TrainingTemplateIcon';

function DraftExerciseActions({ open, children }) {
  const [present, setPresent] = useState(open);
  const element = useRef(null), motion = useRef(null), closing = useRef(false);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    closing.current = !open;
    if (open) {
      setPresent(true);
      if (motion.current?.effect?.target !== node) {
        motion.current = node.animate([{ height: '0px', opacity: 0 }, { height: `${node.scrollHeight}px`, opacity: 1 }], {
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 180,
          easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
        });
        motion.current.onfinish = () => { if (closing.current && motion.current.playbackRate < 0 && motion.current.currentTime <= .5) setPresent(false); };
      } else { motion.current.updatePlaybackRate(1); motion.current.play(); }
    } else { motion.current?.updatePlaybackRate(-1); motion.current?.play(); }
  }, [open]);
  useEffect(() => () => motion.current?.cancel(), []);
  return open || present ? <div ref={element} className="training-draft-actions-clip" aria-hidden={!open} inert={!open ? '' : undefined}><div className="training-draft-actions">{children}</div></div> : null;
}

export function TemplateExerciseDrafts({ exercises, onChange }) {
  const [options, setOptions] = useState(null);
  const addTrigger = useRef(null);
  const list = useRef(null), previous = useRef(new Map()), springs = useRef(new Map()), frame = useRef(null);
  const capture = () => {
    previous.current = new Map([...list.current?.querySelectorAll('[data-draft-row]') || []].map(row => [row.dataset.draftRow, row.getBoundingClientRect().top]));
    cancelAnimationFrame(frame.current);
  };
  useLayoutEffect(() => {
    const rows = [...list.current?.querySelectorAll('[data-draft-row]') || []];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map();
    for (const row of rows) {
      row.style.transform = '';
      const id = row.dataset.draftRow;
      const offset = previous.current.has(id) ? previous.current.get(id) - row.getBoundingClientRect().top : 0;
      const state = { element: row, offset: reduced ? 0 : offset, velocity: reduced ? 0 : springs.current.get(id)?.velocity || 0 };
      next.set(id, state);
      row.style.transform = `translateY(${state.offset}px)`;
    }
    springs.current = next;
    previous.current.clear();
    let last;
    const tick = time => {
      const dt = Math.min(.025, last ? (time - last) / 1000 : 1 / 60);
      last = time;
      let moving = false;
      for (const state of springs.current.values()) {
        state.velocity += (-460 * state.offset - 43 * state.velocity) * dt;
        state.offset += state.velocity * dt;
        if (Math.abs(state.offset) < .1 && Math.abs(state.velocity) < .1) { state.offset = 0; state.velocity = 0; }
        else moving = true;
        state.element.style.transform = state.offset ? `translate3d(0, ${state.offset}px, 0)` : '';
      }
      if (moving) frame.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(frame.current);
    if (!reduced) frame.current = requestAnimationFrame(tick);
  }, [exercises]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const move = (index, direction) => {
    capture();
    const rows = [...exercises];
    [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]];
    onChange(rows);
  };
  return <section className="training-create-exercises" aria-label={t('Exercises')}>
    <header className="training-template-section-heading"><h3>{t('Exercises')}</h3><span>{exercises.length}</span></header>
    {exercises.length > 0 && <div ref={list} className="training-template-exercise-list">
      {exercises.map((exercise, index) => <div key={exercise.draft_id} data-draft-row={exercise.draft_id} className="training-template-exercise" onKeyDown={event => {
        if (event.key === 'Escape' && options === exercise.draft_id) {
          event.stopPropagation(); setOptions(null); event.currentTarget.querySelector('.training-template-options')?.focus({ preventScroll: true });
        }
      }}>
        <div className="training-template-exercise-row">
          <span className="training-exercise-number">{String(index + 1).padStart(2, '0')}</span>
          <span className="training-template-exercise-name min-w-0 flex-1">{exerciseLabel(exercise)}</span>
          <button type="button" className="training-template-options" aria-label={`${t('Exercise options')} ${exerciseLabel(exercise)}`} aria-expanded={options === exercise.draft_id} onClick={() => setOptions(options === exercise.draft_id ? null : exercise.draft_id)}><MoreHorizontal size={20} /></button>
        </div>
        <DraftExerciseActions open={options === exercise.draft_id}>
          <button type="button" className="training-template-action" aria-label={t('Move up')} disabled={index === 0} onClick={() => move(index, -1)}><ChevronDown size={16} className="rotate-180" /><span>{t('Up')}</span></button>
          <button type="button" className="training-template-action" aria-label={t('Move down')} disabled={index === exercises.length - 1} onClick={() => move(index, 1)}><ChevronDown size={16} /><span>{t('Down')}</span></button>
          <button type="button" className="training-template-action is-destructive" aria-label={t('Remove exercise')} onClick={() => { capture(); onChange(exercises.filter(row => row.draft_id !== exercise.draft_id)); setOptions(null); requestAnimationFrame(() => addTrigger.current?.querySelector('button')?.focus({ preventScroll: true })); }}><Trash2 size={16} /><span>{t('Remove')}</span></button>
        </DraftExerciseActions>
      </div>)}
    </div>}
    <div ref={addTrigger}><ExerciseSelector value="" inputLabel={t('Add exercise')} buttonLabel={t('Add exercise')} onCommit={exercise => { capture(); onChange([...exercises, { ...exercise, draft_id: crypto.randomUUID(), notes: '' }]); }} /></div>
  </section>;
}

function AppearanceMenu({ label, preview, children }) {
  const menu = useRef(null);
  const body = useRef(null);
  const motion = useRef(null);
  const expanded = useRef(false);
  useEffect(() => () => motion.current?.cancel(), []);
  const toggle = event => {
    event.preventDefault();
    const element = menu.current;
    const start = element.getBoundingClientRect().height;
    motion.current?.cancel();
    expanded.current = !expanded.current;
    const open = expanded.current;
    element.open = true;
    element.dataset.expanded = String(open);
    body.current.inert = !open;
    const header = element.querySelector('summary').getBoundingClientRect().height;
    const end = header + (open ? body.current.scrollHeight : 0) + 2;
    element.style.overflow = 'hidden';
    const animation = element.animate([{ height: `${start}px` }, { height: `${end}px` }], {
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 220,
      easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
    });
    motion.current = animation;
    animation.onfinish = () => {
      if (motion.current !== animation) return;
      element.open = open;
      animation.cancel();
      element.style.overflow = '';
    };
  };
  return <details ref={menu} className="training-appearance-menu">
    <summary onClick={toggle}><span>{t(label)}</span><span className="training-appearance-current">{preview}<ChevronDown size={16} /></span></summary>
    <div ref={body}>{children}</div>
  </details>;
}

export function TemplatePreview({ template, onNameChange }) {
  const appearance = templateAppearance(template);
  const color = TEMPLATE_COLORS[appearance.color_key];
  return <div className="flex min-w-0 items-center gap-3 rounded-lg border p-4" style={{ borderColor: `${color}66`, backgroundColor: `${color}0D` }}>
    <span style={{ color }}><TrainingTemplateIcon iconKey={appearance.icon_key} /></span>
    {onNameChange ? <label className="training-template-name-editor">
      <span className="training-template-name-label">{t('Template name')}</span>
      <input className="training-template-title-input" placeholder={t('Name your template')} value={template.name} onChange={event => onNameChange(event.target.value)} autoComplete="off" />
    </label> : <span className="min-w-0 break-words text-sm font-semibold text-zinc-100">{template.name || t('Template name')}</span>}
  </div>;
}

export function TemplateAppearanceEditor({ value, onChange }) {
  const appearance = templateAppearance(value);
  const closeMenu = event => {
    const menu = event.currentTarget.closest('details');
    menu.querySelector('summary').click();
    menu.querySelector('summary').focus({ preventScroll: true });
  };
  return <div className="grid min-w-0 gap-4">
    <TemplatePreview template={value} onNameChange={name => onChange({ ...value, name })} />
    <AppearanceMenu label="Choose color" preview={<span className="training-appearance-swatch" style={{ backgroundColor: TEMPLATE_COLORS[appearance.color_key] }} />}>
      <div role="group" aria-label={t('Choose color')} className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-8">{Object.entries(TEMPLATE_COLORS).map(([key, color]) => <button key={key} type="button" aria-label={t(key[0].toUpperCase() + key.slice(1))} title={t(key[0].toUpperCase() + key.slice(1))} aria-pressed={appearance.color_key === key} onClick={event => { onChange({ ...value, color_key: key }); closeMenu(event); }} className={`grid min-h-11 place-items-center rounded-md border ${appearance.color_key === key ? 'border-white' : 'border-white/10'}`}><span className="h-5 w-5 rounded-full" style={{ backgroundColor: color }} /></button>)}</div>
    </AppearanceMenu>
    <AppearanceMenu label="Choose icon" preview={<span style={{ color: TEMPLATE_COLORS[appearance.color_key] }}><TrainingTemplateIcon iconKey={appearance.icon_key} size={23} /></span>}>
      <div role="group" aria-label={t('Choose icon')} className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-6">{Object.entries(TEMPLATE_ICONS).map(([key, label]) => <button key={key} type="button" title={t(label)} aria-label={t(label)} aria-pressed={appearance.icon_key === key} onClick={event => { onChange({ ...value, icon_key: key }); closeMenu(event); }} style={{ color: TEMPLATE_COLORS[appearance.color_key], backgroundColor: appearance.icon_key === key ? `${TEMPLATE_COLORS[appearance.color_key]}20` : undefined }} className={`grid min-h-[72px] min-w-0 content-center justify-items-center gap-1 rounded-lg border p-2 ${appearance.icon_key === key ? 'border-white ring-1 ring-white/40' : 'border-white/10'}`}><TrainingTemplateIcon iconKey={key} size={32} /><span className="text-center text-[10px] leading-tight text-zinc-300">{t(label)}</span></button>)}</div>
    </AppearanceMenu>
  </div>;
}

export function TrainingQuickStart({ templates, status, error, busy, startingId, onStart, onSetup }) {
  return <section className="training-templates" aria-label={t('Templates')}>
    <header className="training-templates-heading">
      <h2>{t('Templates')}</h2>
      <p>{t('Tap a template to start.')}</p>
    </header>
    {error ? <p role="alert" className="text-sm text-red-300">{t(error)}</p> : null}
    {status === 'loading' ? <p role="status" className="text-sm text-zinc-400">{t('Loading templates')}</p> : null}
    {status === 'ready' && !error && templates.length === 0 ? <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
      <p className="mb-3 text-sm text-zinc-400">{t('No templates yet.')}</p>
      <button type="button" disabled={busy} onClick={() => onSetup({ name: '', notes: '' })} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-100"><Plus size={18} aria-hidden="true" />{t('Create template')}</button>
    </div> : null}
    <div className="training-template-list">{templates.map((template) => {
      const appearance = templateAppearance(template);
      const color = TEMPLATE_COLORS[appearance.color_key];
      const count = template.workout_template_exercises?.length || 0;
      const startable = Boolean(template.id && count);
      return <button key={template.id} type="button" disabled={busy || status !== 'ready' || Boolean(error)} aria-label={`${t(startable ? 'Start' : 'Set up')} ${template.name}`} onClick={() => startable ? onStart(template.id) : onSetup(template)} className="training-template-card" style={{ '--template-accent': color }}>
        <span className="training-template-icon"><TrainingTemplateIcon iconKey={appearance.icon_key} size={36} /></span>
        <span className="training-template-copy"><span className="training-template-name">{template.name}</span><span className="training-template-detail">{startable ? `${count}${t(' exercises')}` : t('Set up template')}</span></span>
        {startingId === template.id ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ChevronRight size={20} className="training-template-chevron" aria-hidden="true" />}
      </button>;
    })}</div>
  </section>;
}
