// Capability switches for the Jarvis Companion (docs/specs/jarvis-companion.md §6).
// Every capability is off unless its environment variable is explicitly truthy,
// so a missing or mistyped value can never switch a capability on.

export const COMPANION_CAPABILITIES = Object.freeze({
  agent: 'COMPANION_AGENT',
  proactive: 'COMPANION_PROACTIVE',
  calls: 'COMPANION_CALLS',
  email: 'COMPANION_EMAIL',
});

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

export function isCompanionCapabilityEnabled(capability, env = process.env) {
  const variable = COMPANION_CAPABILITIES[capability];
  if (!variable) throw new Error(`Unknown Companion capability: ${capability}`);
  return TRUTHY.has(String(env?.[variable] ?? '').trim().toLowerCase());
}

export function companionCapabilityState(env = process.env) {
  return Object.fromEntries(
    Object.keys(COMPANION_CAPABILITIES).map((capability) => [capability, isCompanionCapabilityEnabled(capability, env)]),
  );
}
