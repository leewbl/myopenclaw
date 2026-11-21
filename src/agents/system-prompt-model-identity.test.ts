// #177432: `agents.defaults.systemPrompt.modelIdentity` gates the runtime
// "Current model identity" instruction line. The default stays true, and the only
// prompt bytes that change when it is false are that instruction line itself.
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from "@openclaw/ai/internal/shared";
import { describe, expect, it, onTestFinished } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { validateConfigObjectRaw } from "../config/validation-core.js";
import { AgentDefaultsSchema } from "../config/zod-schema.agent-defaults.js";
import { prepareSystemAgentRunAdmission } from "./admitted-run-context.js";
import { finalizeCliSystemPrompt } from "./cli-runner/prompt-context.js";
import { prepareEmbeddedAttemptPromptAssembly } from "./embedded-agent-runner/run/attempt-prompt-build.js";
import { makeProviderModelFixture } from "./test-helpers/provider-model-fixture.js";
import {
  buildAgentSystemPrompt,
  buildModelIdentityPromptLine,
  isModelIdentityPromptEnabled,
} from "./system-prompt.js";
import { buildConfiguredAgentSystemPrompt } from "./system-prompt-config.js";

const GATEWAY_MODEL = "gateway/chat";
const IDENTITY_LINE = buildModelIdentityPromptLine(GATEWAY_MODEL)!;
const MODEL_IDENTITY_OFF: OpenClawConfig = {
  agents: { defaults: { systemPrompt: { modelIdentity: false } } },
};
const MODEL_IDENTITY_ON: OpenClawConfig = {
  agents: { defaults: { systemPrompt: { modelIdentity: true } } },
};
const BASE_PROMPT_SUFFIXED_WITH_IDENTITY = `${SYSTEM_PROMPT_CACHE_BOUNDARY}\n${IDENTITY_LINE}`;

describe("agents.defaults.systemPrompt.modelIdentity config", () => {
  it("parses when omitted so existing configs keep today's behavior", () => {
    const existing = validateConfigObjectRaw({ agents: { entries: { main: {} } } });
    expect(existing.ok).toBe(true);
    if (existing.ok) {
      expect(existing.config.agents?.defaults?.systemPrompt?.modelIdentity).toBeUndefined();
    }
    expect(isModelIdentityPromptEnabled()).toBe(true);
    expect(isModelIdentityPromptEnabled({})).toBe(true);
    expect(isModelIdentityPromptEnabled({ agents: {} })).toBe(true);
  });

  it("accepts an explicit boolean and rejects other shapes", () => {
    expect(AgentDefaultsSchema.parse(undefined)).toBeUndefined();
    expect(AgentDefaultsSchema.parse({})).toEqual({});
    expect(AgentDefaultsSchema.parse({ systemPrompt: {} })).toEqual({ systemPrompt: {} });
    expect(AgentDefaultsSchema.parse({ systemPrompt: { modelIdentity: false } })).toEqual({
      systemPrompt: { modelIdentity: false },
    });
    expect(AgentDefaultsSchema.parse({ systemPrompt: { modelIdentity: true } })).toEqual({
      systemPrompt: { modelIdentity: true },
    });
    expect(AgentDefaultsSchema.safeParse({ systemPrompt: { modelIdentity: "false" } }).success).toBe(
      false,
    );
    expect(
      AgentDefaultsSchema.safeParse({ systemPrompt: { modelIdentity: false, other: true } }).success,
    ).toBe(false);
    expect(isModelIdentityPromptEnabled(MODEL_IDENTITY_OFF)).toBe(false);
    expect(isModelIdentityPromptEnabled(MODEL_IDENTITY_ON)).toBe(true);
  });
});

describe("model identity line in the full system prompt", () => {
  const render = (overrides: { config?: OpenClawConfig; modelIdentityPrompt?: boolean } = {}) =>
    overrides.config
      ? buildConfiguredAgentSystemPrompt({
          workspaceDir: "/srv/agents/ws",
          runtimeInfo: { model: GATEWAY_MODEL },
          config: overrides.config,
        })
      : buildAgentSystemPrompt({
          workspaceDir: "/srv/agents/ws",
          runtimeInfo: { model: GATEWAY_MODEL },
          ...(overrides.modelIdentityPrompt === undefined
            ? {}
            : { modelIdentityPrompt: overrides.modelIdentityPrompt }),
        });

  it('reproduction: the default prompt instructs "Current model identity: gateway/chat"', () => {
    for (const prompt of [
      render(),
      render({ modelIdentityPrompt: true }),
      render({ config: {} }),
      render({ config: MODEL_IDENTITY_ON }),
    ]) {
      expect(prompt).toContain(IDENTITY_LINE);
      expect(prompt).toContain(`model=${GATEWAY_MODEL}`);
    }
  });

  it("omits only the instruction line when the option is false", () => {
    const disabled = render({ modelIdentityPrompt: false });
    expect(disabled).not.toContain("Current model identity");
    // Every other byte of the prompt, including the Runtime `model=` data field, is unchanged.
    expect(render().replace(`${IDENTITY_LINE}\n`, "")).toBe(disabled);
    expect(disabled).toContain(`model=${GATEWAY_MODEL}`);
  });

  it("honors the config value through the config-aware builder", () => {
    expect(render({ config: MODEL_IDENTITY_OFF })).not.toContain("Current model identity");
    expect(render({ config: MODEL_IDENTITY_OFF })).toBe(render({ modelIdentityPrompt: false }));
    expect(render({ config: MODEL_IDENTITY_ON })).toContain(IDENTITY_LINE);
  });
});

describe("model identity line in the promptMode:none prompt", () => {
  const render = (overrides: { config?: OpenClawConfig; modelIdentityPrompt?: boolean } = {}) =>
    overrides.config
      ? buildConfiguredAgentSystemPrompt({
          workspaceDir: "/srv/agents/ws",
          runtimeInfo: { model: GATEWAY_MODEL },
          promptMode: "none",
          config: overrides.config,
        })
      : buildAgentSystemPrompt({
          workspaceDir: "/srv/agents/ws",
          runtimeInfo: { model: GATEWAY_MODEL },
          promptMode: "none",
          ...(overrides.modelIdentityPrompt === undefined
            ? {}
            : { modelIdentityPrompt: overrides.modelIdentityPrompt }),
        });

  it("keeps the line by default", () => {
    expect(render()).toBe(
      `You are a personal assistant running inside OpenClaw.\n${IDENTITY_LINE}`,
    );
    expect(render({ config: MODEL_IDENTITY_ON })).toBe(render());
  });

  it("renders only the assistant line when the option is false", () => {
    const bare = "You are a personal assistant running inside OpenClaw.";
    expect(render({ modelIdentityPrompt: false })).toBe(bare);
    expect(render({ config: MODEL_IDENTITY_OFF })).toBe(bare);
  });
});

describe("model identity line in the CLI runner append path", () => {
  const finalize = (config?: OpenClawConfig, systemPrompt = "Base CLI prompt") =>
    finalizeCliSystemPrompt(systemPrompt, {
      modelDisplay: GATEWAY_MODEL,
      backendResolved: {},
      params: config ? { config } : {},
    });

  it("keeps appending the line after the cache boundary by default", () => {
    const expected = `Base CLI prompt${BASE_PROMPT_SUFFIXED_WITH_IDENTITY}`;
    expect(finalize()).toBe(expected);
    expect(finalize({})).toBe(expected);
    expect(finalize(MODEL_IDENTITY_ON)).toBe(expected);
  });

  it("skips the append entirely when the option is false", () => {
    expect(finalize(MODEL_IDENTITY_OFF)).toBe("Base CLI prompt");
    // A base prompt still carrying an older line is returned byte-for-byte.
    const stale = `Base CLI prompt\n${IDENTITY_LINE}`;
    expect(finalize(MODEL_IDENTITY_OFF, stale)).toBe(stale);
  });
});

describe("model identity line in the embedded runner append path", () => {
  type PromptAssemblyInput = Parameters<typeof prepareEmbeddedAttemptPromptAssembly>[0];

  async function assembleEmbeddedPrompt(config: OpenClawConfig = { agents: { defaults: {} } }) {
    const runId = "model-identity-append";
    const admission = prepareSystemAgentRunAdmission(config, runId, "main", runId);
    onTestFinished(() => admission.close());
    let systemPrompt = "Base embedded prompt";
    await prepareEmbeddedAttemptPromptAssembly({
      attempt: {
        admittedRunContext: await admission.admit("embedded"),
        config,
        model: makeProviderModelFixture({
          id: "chat",
          provider: "gateway",
          api: "openai-responses",
          baseUrl: "https://gateway.example.test/v1",
        }),
        provider: "gateway",
        prompt: "Which model are you?",
        transcriptPrompt: "Which model are you?",
        runId,
        sessionId: runId,
        sessionPersistence: "detached",
        trigger: "user",
        workspaceDir: "/tmp/model-identity-test",
      },
      activeSession: { messages: [] },
      sessionManager: { getLeafId: () => null },
      hookRunner: {
        hasHooks: () => false,
        hasAuthorizedPromptBuildHooks: () => false,
      } as unknown as PromptAssemblyInput["hookRunner"],
      hookAgentId: "main",
      diagnosticTrace: { traceId: "177432".padStart(32, "0") },
      isRawModelRun: false,
      sessionAgentId: "main",
      runtimeModel: GATEWAY_MODEL,
      systemPromptText: systemPrompt,
      hasBaselineTools: () => false,
      applyPromptBuildToolsAllow: () => [],
      setActiveSessionSystemPrompt: (prompt) => {
        systemPrompt = prompt;
      },
    });
    return systemPrompt;
  }

  it("keeps appending the line after the cache boundary by default", async () => {
    const expected = `Base embedded prompt${BASE_PROMPT_SUFFIXED_WITH_IDENTITY}`;
    // A defaults block without the key keeps today's behavior (option unset).
    expect(await assembleEmbeddedPrompt()).toBe(expected);
    expect(await assembleEmbeddedPrompt({})).toBe(expected);
    expect(await assembleEmbeddedPrompt(MODEL_IDENTITY_ON)).toBe(expected);
  });

  it("leaves the prepared prompt untouched when the option is false", async () => {
    expect(await assembleEmbeddedPrompt(MODEL_IDENTITY_OFF)).toBe("Base embedded prompt");
  });
});
