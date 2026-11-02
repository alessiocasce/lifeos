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

export function normalizeTemplateAppearance(template = {}) {
  return {
    color_key: Object.hasOwn(TEMPLATE_COLORS, template.color_key) ? template.color_key : 'slate',
    icon_key: Object.hasOwn(TEMPLATE_ICONS, template.icon_key) ? template.icon_key : 'dumbbell',
  };
}

export const templateAppearance = normalizeTemplateAppearance;
