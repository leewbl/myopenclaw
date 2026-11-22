#!/usr/bin/env node
// Verifies the legacy metadata.clawdbot warning feature across the three
// relevant Vitest suites. Read-only: runs tests, never mutates sources.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const suites = [
  "src/skills/loading/frontmatter.test.ts",
  "src/skills/discovery/status.test.ts",
  "src/cli/skills-cli.test.ts",
];

const VITEST = "/app/node_modules/vitest/vitest.mjs";
let tmpDir;
try {
  // /tmp may be mounted noexec in the runner sandbox; status tests create
  // fake executables and check X_OK, so point os.tmpdir() at a fresh
  // executable-backed directory for each Vitest subprocess.
  tmpDir = fs.mkdtempSync("/workspace/iboard-legacy-fixture-");
} catch (error) {
  console.error(`Failed to create temp dir under /workspace: ${error}`);
  process.exit(1);
}
const env = { ...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir };

let failed = false;
for (const suite of suites) {
  console.log(`Running ${suite}`);
  const result = spawnSync(
    "node",
    [VITEST, "run", "--maxWorkers=1", "--root", "/app", suite],
    { stdio: "inherit", env },
  );
  if (result.error || result.status !== 0) {
    console.error(`Suite failed: ${suite}`);
    failed = true;
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });
if (!failed) {
  console.log("LEGACY_SKILL_METADATA_PASS");
}
process.exit(failed ? 1 : 0);
