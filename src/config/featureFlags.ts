export function featureFlagEnabled(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const PLANNING_ASSISTANT_ENABLED = featureFlagEnabled(import.meta.env.VITE_PLANNING_ASSISTANT_ENABLED);
export const PLANNING_PREDICTIONS_ENABLED = featureFlagEnabled(import.meta.env.VITE_PLANNING_PREDICTIONS_ENABLED);
