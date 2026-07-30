import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";
import path from "node:path";

import { createInMemoryAiAdapter } from "@/lib/ai/testing/in-memory-adapter";
import { AiError, type AiProviderAdapter } from "@/lib/ai/types";

const fixtureModules = path.join(process.cwd(), "tests/fixtures/node_modules");
process.env.NODE_PATH = [fixtureModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
(Module as unknown as { _initPaths: () => void })._initPaths();

type CallLog = {
  scenarioProfileId: number | null;
  profileKey: string;
  providerCode: string | null;
  modelId: string | null;
  status: "success" | "failure";
  errorCode?: string;
};

type TestProfile = {
  id: number;
  key: string;
  name: string;
  providerCode: string;
  modelId: string | null;
  parameters: Record<string, unknown>;
  enabled: boolean;
};

const profile: TestProfile = {
  id: 7,
  key: "metadata-formatting",
  name: "Форматирование метаданных",
  providerCode: "in-memory",
  modelId: "profile-model",
  parameters: { temperature: 0.5 },
  enabled: true,
};

function runtimeConfig(
  settings: Record<string, unknown> = {},
  defaultModelId: string | null = null,
) {
  return {
    settings: {
      providerCode: "in-memory",
      enabled: true,
      defaultModelId,
      settings,
    },
    credentials: {
      providerCode: "in-memory",
      encryptedPayload: "encrypted",
      keyHint: "••••test",
    },
  };
}

async function loadCreateAiService() {
  return (await import("@/lib/ai/service")).createAiService;
}

function createDependencies(input?: {
  adapter?: AiProviderAdapter;
  profile?: TestProfile | null;
  config?: ReturnType<typeof runtimeConfig>;
  logs?: CallLog[];
  writeCallLog?: (entry: CallLog) => Promise<void>;
}) {
  const logs = input?.logs ?? [];
  return {
    getProfile: async () => input?.profile === undefined ? profile : input.profile,
    getProviderConfig: async () => input?.config ?? runtimeConfig(),
    getAdapter: () => input?.adapter ?? createInMemoryAiAdapter(),
    decryptCredentials: () => ({ token: "secret" }),
    writeCallLog: input?.writeCallLog ?? (async (entry: CallLog) => { logs.push(entry); }),
    now: () => 100,
  };
}

describe("AI service", () => {
  it("merges provider, scenario, and runtime parameters in that order", async () => {
    const createAiService = await loadCreateAiService();
    let received: Record<string, unknown> | undefined;
    const adapter = createInMemoryAiAdapter({
      async generateText(request) {
        received = request.parameters;
        return { text: "ok", modelId: request.modelId };
      },
    });
    const service = createAiService(createDependencies({
      adapter,
      config: runtimeConfig({ temperature: 0.2, maxOutputTokens: 100 }),
    }) as never);

    await service.generateText({
      profileKey: profile.key,
      messages: [{ role: "user", content: "test" }],
      overrides: { temperature: 0.8, maxOutputTokens: 200 },
    });

    assert.deepEqual(received, {
      temperature: 0.8,
      maxOutputTokens: 200,
      timeoutMs: 30_000,
    });
  });

  it("preserves explicit zero and false scenario overrides over provider defaults", async () => {
    const createAiService = await loadCreateAiService();
    let received: Record<string, unknown> | undefined;
    const adapter = createInMemoryAiAdapter({
      settingFields: [
        { key: "reasoning", label: "Reasoning", type: "boolean", defaultValue: true },
      ],
      async generateText(request) {
        received = request.parameters;
        return { text: "ok", modelId: request.modelId };
      },
    });
    const service = createAiService(createDependencies({
      adapter,
      profile: {
        ...profile,
        parameters: { temperature: 0, reasoning: false },
      },
      config: runtimeConfig({ temperature: 0.8, reasoning: true }),
    }) as never);

    await service.generateText({ profileKey: profile.key, messages: [] });

    assert.equal(received?.temperature, 0);
    assert.equal(received?.reasoning, false);
  });

  it("uses the provider default model when the scenario does not override it", async () => {
    const createAiService = await loadCreateAiService();
    const logs: CallLog[] = [];
    const service = createAiService(createDependencies({
      logs,
      profile: { ...profile, modelId: null },
      config: runtimeConfig({}, "provider-default-model"),
    }) as never);

    const result = await service.generateText({ profileKey: profile.key, messages: [] });

    assert.equal(result.modelId, "provider-default-model");
    assert.equal(logs[0]?.modelId, "provider-default-model");
  });

  it("rejects and logs a scenario with no effective model", async () => {
    const createAiService = await loadCreateAiService();
    const logs: CallLog[] = [];
    const service = createAiService(createDependencies({
      logs,
      profile: { ...profile, modelId: null },
      config: runtimeConfig({}, null),
    }) as never);

    await assert.rejects(
      service.generateText({ profileKey: profile.key, messages: [] }),
      (error) => error instanceof AiError && error.code === "configuration",
    );
    assert.equal(logs[0]?.modelId, null);
    assert.equal(logs[0]?.status, "failure");
    assert.equal(logs[0]?.errorCode, "configuration");
  });

  it("keeps an explicit scenario model override over the provider default", async () => {
    const createAiService = await loadCreateAiService();
    const service = createAiService(createDependencies({
      config: runtimeConfig({}, "provider-default-model"),
    }) as never);

    assert.equal(
      (await service.generateText({ profileKey: profile.key, messages: [] })).modelId,
      "profile-model",
    );
  });

  it("logs configuration failures before an adapter call", async () => {
    const createAiService = await loadCreateAiService();
    const logs: CallLog[] = [];
    const service = createAiService(createDependencies({
      logs,
      profile: null,
    }) as never);

    await assert.rejects(
      service.generateText({ profileKey: "missing", messages: [] }),
      (error) => error instanceof AiError && error.code === "configuration",
    );
    assert.deepEqual(logs, [{
      scenarioProfileId: null,
      profileKey: "missing",
      providerCode: null,
      modelId: null,
      status: "failure",
      latencyMs: 0,
      errorCode: "configuration",
    }]);
  });

  it("logs provider lookup failures with resolved profile metadata", async () => {
    const createAiService = await loadCreateAiService();
    const logs: CallLog[] = [];
    const dependencies = createDependencies({ logs });
    const service = createAiService({
      ...dependencies,
      getAdapter() {
        throw new AiError("configuration", "unknown provider");
      },
    } as never);

    await assert.rejects(
      service.generateText({ profileKey: profile.key, messages: [] }),
      (error) => error instanceof AiError && error.code === "configuration",
    );
    assert.equal(logs[0]?.status, "failure");
    assert.equal(logs[0]?.providerCode, "in-memory");
    assert.equal(logs[0]?.modelId, "profile-model");
  });

  it("does not let a logger failure mask a generation result or provider error", async () => {
    const createAiService = await loadCreateAiService();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const service = createAiService(createDependencies({
        writeCallLog: async () => { throw new Error("logger unavailable"); },
      }) as never);
      assert.equal(
        (await service.generateText({ profileKey: profile.key, messages: [] })).modelId,
        "profile-model",
      );

      const failing = createAiService(createDependencies({
        adapter: createInMemoryAiAdapter({
          async generateText() {
            throw new AiError("rate-limit", "limited");
          },
        }),
        writeCallLog: async () => { throw new Error("logger unavailable"); },
      }) as never);
      await assert.rejects(
        failing.generateText({ profileKey: profile.key, messages: [] }),
        (error) => error instanceof AiError && error.code === "rate-limit",
      );
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("aborts and reports an operation that exceeds its configured timeout", async () => {
    const createAiService = await loadCreateAiService();
    let aborted = false;
    const adapter = createInMemoryAiAdapter({
      async generateText(_request, context) {
        await new Promise<void>((resolve) => {
          context.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          }, { once: true });
        });
        return { text: "late", modelId: "profile-model" };
      },
    });
    const service = createAiService(createDependencies({
      adapter,
      config: runtimeConfig({ timeoutMs: 1_000 }),
    }) as never);

    await assert.rejects(
      service.generateText({ profileKey: profile.key, messages: [] }),
      (error) => error instanceof AiError && error.code === "timeout",
    );
    assert.equal(aborted, true);
  });

  it("rejects and logs an object that fails server validation", async () => {
    const createAiService = await loadCreateAiService();
    const logs: CallLog[] = [];
    const service = createAiService(createDependencies({ logs }) as never);

    await assert.rejects(
      service.generateObject({
        profileKey: profile.key,
        messages: [{ role: "user", content: "value" }],
        schema: { type: "object", required: ["count"] },
        validate: (value): value is { count: number } =>
          Boolean(value && typeof value === "object" && "count" in value),
      }),
      (error) => error instanceof AiError && error.code === "invalid-response",
    );
    assert.equal(logs[0]?.status, "failure");
    assert.equal(logs[0]?.errorCode, "invalid-response");
  });
});
