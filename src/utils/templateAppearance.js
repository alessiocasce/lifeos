export const TEMPLATE_COLORS = Object.freeze({
  red: '#EF4444', blue: '#3B82F6', purple: '#A855F7', amber: '#F59E0B',
  green: '#10B981', cyan: '#06B6D4', pink: '#EC4899', slate: '#94A3B8',
});

export const TEMPLATE_ICONS = Object.freeze({
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps',
  triceps: 'Triceps', quads: 'Quadriceps', hamstrings: 'Hamstrings',
  calves: 'Calves', core: 'Core / Abs', full_body: 'Full Body',
  boxing: 'Boxing', dumbbell: 'General Dumbbell',
});

export const SUGGESTED_TEMPLATES = Object.freeze([
  { name: 'Chest + Triceps', color_key: 'red', icon_key: 'chest' },
  { name: 'Back + Biceps', color_key: 'blue', icon_key: 'back' },
  { name: 'Quads', color_key: 'green', icon_key: 'quads' },
  { name: 'Hamstrings', color_key: 'amber', icon_key: 'hamstrings' },
  { name: 'Shoulders + Arms', color_key: 'purple', icon_key: 'shoulders' },
]);

export function normalizeTemplateAppearance(template = {}) {
  return {
    color_key: Object.hasOwn(TEMPLATE_COLORS, template.color_key) ? template.color_key : 'slate',
    icon_key: Object.hasOwn(TEMPLATE_ICONS, template.icon_key) ? template.icon_key : 'dumbbell',
  };
}

export const templateAppearance = normalizeTemplateAppearance;

export function quickStartTemplates(templates = []) {
  const normalize = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const matched = new Set();
  const suggested = SUGGESTED_TEMPLATES.map((suggestion) => {
    const template = templates.find((item) => normalize(item.name) === normalize(suggestion.name));
    if (template) matched.add(template.id);
    return template || suggestion;
  });
  return [...suggested, ...templates.filter((template) => !matched.has(template.id))];
}
