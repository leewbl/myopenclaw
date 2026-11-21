import type { OpenClawConfig } from "../config/types.openclaw.js";

/**
 * Whether the runtime model identity instruction line belongs in the system prompt.
 *
 * Backed by `agents.defaults.systemPrompt.modelIdentity`, which defaults to `true` so
 * existing configs keep the line. The Runtime `model=` data field is unaffected.
 */
export function isModelIdentityPromptEnabled(config?: OpenClawConfig): boolean {
  return config?.agents?.defaults?.systemPrompt?.modelIdentity !== false;
}
