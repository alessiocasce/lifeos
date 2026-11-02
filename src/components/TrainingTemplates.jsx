import { Dumbbell, Loader2, Plus } from 'lucide-react';
import { t } from '../i18n';
import { TEMPLATE_COLORS, TEMPLATE_ICONS, quickStartTemplates, templateAppearance } from '../utils/templateAppearance';

// A shared anatomical outline highlights the selected muscle without changing its silhouette.
export function TrainingTemplateIcon({ iconKey, size = 28 }) {
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
  return <svg width={size} height={size} viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={iconKey}>
    <circle cx="12" cy="4" r="2.5" />
    <path d="M8 8 5 9 3 16M16 8l3 1 2 7M8 8l1 7-1 9M16 8l-1 7 1 9M9 15h6M12 17v7" opacity=".5" />
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
  return <section className="grid min-w-0 gap-4" aria-label={t('Quick start')}>
    <h2 className="text-base font-semibold text-zinc-100">{t('Quick start')}</h2>
    {error ? <p role="alert" className="text-sm text-red-300">{t(error)}</p> : null}
    {status === 'loading' ? <p role="status" className="text-sm text-zinc-400">{t('Loading templates')}</p> : null}
    <div className="grid min-w-0 grid-cols-2 gap-3">{quickStartTemplates(templates).map((template) => {
      const appearance = templateAppearance(template);
      const color = TEMPLATE_COLORS[appearance.color_key];
      const count = template.workout_template_exercises?.length || 0;
      const startable = Boolean(template.id && count);
      return <button key={template.id || template.name} type="button" disabled={busy || status !== 'ready' || Boolean(error)} aria-label={`${t(startable ? 'Start' : 'Set up')} ${template.name}`} onClick={() => startable ? onStart(template.id) : onSetup(template)} className="grid min-h-36 min-w-0 content-between gap-4 rounded-lg border p-4 text-left transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50" style={{ borderColor: `${color}55`, backgroundColor: `${color}0D` }}>
        <span className="flex items-center justify-between gap-2" style={{ color }}><TrainingTemplateIcon iconKey={appearance.icon_key} />{startingId === template.id ? <Loader2 size={16} className="animate-spin" /> : !startable ? <Plus size={16} /> : null}</span>
        <span className="min-w-0"><span className="block break-words text-sm font-semibold text-zinc-100">{template.name}</span><span className="mt-1 block text-xs text-zinc-400">{startable ? `${count}${t(' exercises')}` : t('Set up template')}</span></span>
      </button>;
    })}</div>
  </section>;
}
