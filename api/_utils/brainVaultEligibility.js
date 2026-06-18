const VAULT_RETRIEVAL_SKILLS = new Set([
  'workout_coach',
  'project_ops_coach',
  'finance_analyst',
  'life_review',
  'product_builder',
]);

const SIMPLE_WRITE_ACTIONS_WITHOUT_VAULT = new Set([
  'update_health_log',
  'log_sleep_start',
  'create_memo',
  'create_calendar_event',
  'create_expense',
  'log_habit',
  'update_habit',
]);

export function shouldRetrieveBrainVault({ brainRoute, brainSkill } = {}) {
  const mode = brainRoute?.mode;
  if (['casual_chat', 'memory_write', 'memory_forget', 'follow_up_transform', 'clarification'].includes(mode)) return false;
  if (mode === 'memory_recall') return false;
  const skillId = brainSkill?.skill?.id ?? brainSkill?.id;
  if (mode === 'explicit_action' && isSimpleExplicitWriteRoute(brainRoute, skillId)) return false;
  if (VAULT_RETRIEVAL_SKILLS.has(skillId)) return true;
  if (['read_only_analysis', 'explicit_action'].includes(mode)) return true;
  return false;
}

export function isSimpleExplicitWriteRoute(brainRoute, skillId) {
  if (brainRoute?.mode !== 'explicit_action') return false;
  const needsData = Array.isArray(brainRoute.needs_data) ? brainRoute.needs_data.filter(Boolean) : [];
  if (needsData.length) return false;
  const proposed = Array.isArray(brainRoute.proposed_action_types) ? brainRoute.proposed_action_types.filter(Boolean) : [];
  if (proposed.length) return proposed.every((item) => SIMPLE_WRITE_ACTIONS_WITHOUT_VAULT.has(item));
  return Boolean(brainRoute.write_intent && ['health_coach', 'calendar_planner', 'memo_assistant', 'finance_analyst'].includes(skillId));
}

