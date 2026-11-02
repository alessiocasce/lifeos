import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { t } from '../i18n';
import { TEMPLATE_COLORS, TEMPLATE_ICONS, templateAppearance } from '../utils/templateAppearance';
import { TrainingTemplateIcon } from './TrainingTemplateIcon';
export { TrainingTemplateIcon } from './TrainingTemplateIcon';

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
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{Object.entries(TEMPLATE_ICONS).map(([key, label]) => <button key={key} type="button" title={t(label)} aria-label={t(label)} aria-pressed={appearance.icon_key === key} onClick={() => onChange({ ...value, icon_key: key })} style={{ color: TEMPLATE_COLORS[appearance.color_key], backgroundColor: appearance.icon_key === key ? `${TEMPLATE_COLORS[appearance.color_key]}20` : undefined }} className={`grid min-h-[72px] min-w-0 content-center justify-items-center gap-1 rounded-lg border p-2 ${appearance.icon_key === key ? 'border-white ring-1 ring-white/40' : 'border-white/10'}`}><TrainingTemplateIcon iconKey={key} size={32} /><span className="text-center text-[10px] leading-tight text-zinc-300">{t(label)}</span></button>)}</div>
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
