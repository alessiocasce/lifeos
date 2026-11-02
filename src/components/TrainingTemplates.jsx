import { ChevronRight, Dumbbell, Loader2 } from 'lucide-react';
import { t } from '../i18n';
import { TEMPLATE_COLORS, TEMPLATE_ICONS, quickStartTemplates, templateAppearance } from '../utils/templateAppearance';

// A shared anatomical outline highlights the selected muscle without changing its silhouette.
export function TrainingTemplateIcon({ iconKey, size = 28, focused = false }) {
  if (!Object.hasOwn(TEMPLATE_ICONS, iconKey) || iconKey === 'dumbbell') return <Dumbbell size={size} aria-hidden="true" />;
  const muscles = {
    chest: 'M8 8h8v3H8z', back: 'M8 8h8l-1 6H9z',
    shoulders: 'M6 8h3v3H6z M15 8h3v3h-3z',
    biceps: 'M5 11h3v4H5z M16 11h3v4h-3z',
    triceps: 'M5 10h2v6H5z M17 10h2v6h-2z',
    quads: 'M8 15h3v5H8z M13 15h3v5h-3z',
    hamstrings: 'M8 14h3v5H8z M13 14h3v5h-3z',
    calves: 'M8 19h2v4H8z M14 19h2v4h-2z', core: 'M10 11h4v4h-4z',
    full_body: 'M8 8h8v7H8z M8 16h3v6H8z M13 16h3v6h-3z',
    boxing: 'M3 10h4v5H3z M17 10h4v5h-4z',
  };
  const focusBox = { chest: '3 7 18 10', back: '3 7 18 10', shoulders: '2 7 20 10', quads: '6 14 12 12', hamstrings: '6 14 12 12' }[iconKey];
  return <svg width={size} height={size} viewBox={focused && focusBox ? focusBox : '0 0 24 26'} fill="none" stroke="currentColor" strokeWidth={focused && focusBox ? 1.25 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={iconKey}>
    <circle cx="12" cy="4" r="2.5" />
    <path d="M8 8 5 9 3 16M16 8l3 1 2 7M8 8l1 7-1 9M16 8l-1 7 1 9M9 15h6M12 17v7" opacity={focused ? '.85' : '.5'} />
    <path d={muscles[iconKey]} fill="currentColor" fillOpacity=".35" />
  </svg>;
}

export function TemplatePreview({ template }) {
  const appearance = templateAppearance(template);
  const color = TEMPLATE_COLORS[appearance.color_key];
  return <div className="flex min-w-0 items-center gap-3 rounded-lg border p-4" style={{ borderColor: `${color}66`, backgroundColor: `${color}0D` }}>
    <span style={{ color }}><TrainingTemplateIcon iconKey={appearance.icon_key} /></span>
    <span className="min-w-0 break-words text-sm font-semibold text-zinc-100">{template.name || t('Template name')}</span>
  </div>;
}

export function TemplateAppearanceEditor({ value, onChange }) {
  const appearance = templateAppearance(value);
  return <div className="grid min-w-0 gap-4">
    <TemplatePreview template={value} />
    <fieldset className="min-w-0"><legend className="mb-2 text-xs text-zinc-300">{t('Choose color')}</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{Object.entries(TEMPLATE_COLORS).map(([key, color]) => <button key={key} type="button" aria-label={t(key[0].toUpperCase() + key.slice(1))} title={t(key[0].toUpperCase() + key.slice(1))} aria-pressed={appearance.color_key === key} onClick={() => onChange({ ...value, color_key: key })} className={`grid min-h-11 place-items-center rounded-md border ${appearance.color_key === key ? 'border-white' : 'border-white/10'}`}><span className="h-5 w-5 rounded-full" style={{ backgroundColor: color }} /></button>)}</div>
    </fieldset>
    <fieldset className="min-w-0"><legend className="mb-2 text-xs text-zinc-300">{t('Choose icon')}</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{Object.entries(TEMPLATE_ICONS).map(([key, label]) => <button key={key} type="button" title={t(label)} aria-label={t(label)} aria-pressed={appearance.icon_key === key} onClick={() => onChange({ ...value, icon_key: key })} className={`grid min-h-11 place-items-center rounded-md border ${appearance.icon_key === key ? 'border-white text-white' : 'border-white/10 text-zinc-400'}`}><TrainingTemplateIcon iconKey={key} size={24} /></button>)}</div>
    </fieldset>
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
    <div className="training-template-list">{quickStartTemplates(templates).map((template) => {
      const appearance = templateAppearance(template);
      const color = TEMPLATE_COLORS[appearance.color_key];
      const count = template.workout_template_exercises?.length || 0;
      const startable = Boolean(template.id && count);
      return <button key={template.id || template.name} type="button" disabled={busy || status !== 'ready' || Boolean(error)} aria-label={`${t(startable ? 'Start' : 'Set up')} ${template.name}`} onClick={() => startable ? onStart(template.id) : onSetup(template)} className="training-template-card" style={{ '--template-accent': color }}>
        <span className="training-template-icon"><TrainingTemplateIcon iconKey={appearance.icon_key} size={36} focused /></span>
        <span className="training-template-copy"><span className="training-template-name">{template.name}</span><span className="training-template-detail">{startable ? `${count}${t(' exercises')}` : t('Set up template')}</span></span>
        {startingId === template.id ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ChevronRight size={20} className="training-template-chevron" aria-hidden="true" />}
      </button>;
    })}</div>
  </section>;
}
