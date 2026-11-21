// Run the full system-prompt regression selection in fresh Vitest processes
// so module graphs do not accumulate in a single Node heap.
import { spawnSync } from 'node:child_process';

const files = [
  "packages/ai/src/utils/system-prompt-cache-boundary.test.ts",
  "src/agents/cli-runner/helpers.system-prompt-resume.test.ts",
  "src/agents/cli-runner/helpers.system-prompt.test.ts",
  "src/agents/embedded-agent-runner/run/attempt-system-prompt.sandbox-info.test.ts",
  "src/agents/embedded-agent-runner/run/attempt-system-prompt.test.ts",
  "src/agents/embedded-agent-runner/system-prompt.test.ts",
  "src/agents/incognito-system-prompt.test.ts",
  "src/agents/progress-card-system-prompt.test.ts",
  "src/agents/subagents/spawn/subagent-system-prompt.test.ts",
  "src/agents/system-prompt-config.test.ts",
  "src/agents/system-prompt-messaging.test.ts",
  "src/agents/system-prompt-model-identity.test.ts",
  "src/agents/system-prompt-params.test.ts",
  "src/agents/system-prompt-report.test.ts",
  "src/agents/system-prompt-report.tool-digest-cache.test.ts",
  "src/agents/system-prompt-stability.test.ts",
  "src/agents/system-prompt-support.test.ts",
  "src/agents/system-prompt.blind.test.ts",
  "src/agents/system-prompt.cache-prefix.test.ts",
  "src/agents/system-prompt.test.ts",
  "src/auto-reply/reply/commands-system-prompt.test.ts"
];
for (let offset = 0; offset < files.length; offset += 3) {
  const batch = files.slice(offset, offset + 3);
  const result = spawnSync(process.execPath, [
    '/app/node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1', '--reporter=dot', ...batch,
  ], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`System prompt regression batch failed: ${batch.join(', ')}`, { cause: result.error });
  }
}
console.log('MODEL_IDENTITY_REGRESSION_PASS');
