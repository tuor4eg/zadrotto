import "server-only";

import { createAiCallLog } from "@/db/queries/ai-call-logs";
import { getAiProviderRuntimeConfig } from "@/db/queries/ai-providers";
import { getEnabledAiScenarioProfile } from "@/db/queries/ai-scenarios";
import { decryptAiCredentials } from "./credential-crypto";
import { aiProviderRegistry } from "./registry";
import { getAiProviderSettingFields, parseAiCredentials, parseAiParameters } from "./schema";
import { runAiWithTimeout } from "./timeout";
import {
  AiError, type AiMessage, type AiObjectResult, type AiParameters,
  type AiProviderAdapter, type AiTextResult,
} from "./types";

type ServiceInput = {
  profileKey: string;
  messages: AiMessage[];
  overrides?: Record<string, unknown>;
};

type Profile = NonNullable<Awaited<ReturnType<typeof getEnabledAiScenarioProfile>>>;
type RuntimeConfig = Awaited<ReturnType<typeof getAiProviderRuntimeConfig>>;

export type AiServiceDependencies = {
  getProfile: (key: string) => Promise<Profile | null>;
  getProviderConfig: (code: string) => Promise<RuntimeConfig>;
  getAdapter: (code: string) => AiProviderAdapter;
  decryptCredentials: (payload: string) => Record<string, string> | null;
  writeCallLog: typeof createAiCallLog;
  now?: () => number;
};

export function normalizeAiError(error: unknown) {
  if (error instanceof AiError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new AiError("timeout", "AI-провайдер не ответил вовремя.", { cause: error });
  }
  return new AiError("provider-unavailable", "AI-провайдер временно недоступен.", {
    cause: error,
  });
}

export function createAiService(deps: AiServiceDependencies) {
  const now = deps.now ?? Date.now;
  async function writeLog(input: Parameters<typeof deps.writeCallLog>[0]) {
    try {
      await deps.writeCallLog(input);
    } catch (error) {
      console.error("Failed to write AI call log", error);
    }
  }

  async function run<T extends AiTextResult | AiObjectResult>(
    input: ServiceInput,
    operation: (
      adapter: AiProviderAdapter,
      request: { messages: AiMessage[]; modelId: string; parameters: AiParameters },
      context: { credentials: Record<string, string>; signal: AbortSignal },
    ) => Promise<T>,
  ) {
    const startedAt = now();
    let profile: Profile | null = null;
    let providerCode: string | null = null;
    let modelId: string | null = null;
    try {
      profile = await deps.getProfile(input.profileKey);
      if (!profile) throw new AiError("configuration", "AI-сценарий не настроен или выключен.");
      providerCode = profile.providerCode;
      modelId = profile.modelId?.trim() || null;
      const adapter = deps.getAdapter(providerCode);
      const config = await deps.getProviderConfig(providerCode);
      if (!config.settings?.enabled || !config.credentials) {
        throw new AiError("configuration", "AI-провайдер не настроен или выключен.");
      }
      const decrypted = deps.decryptCredentials(config.credentials.encryptedPayload);
      if (!decrypted) throw new AiError("configuration", "Не удалось прочитать credentials AI-провайдера.");
      modelId = profile.modelId?.trim() || config.settings.defaultModelId?.trim() || null;
      if (!modelId) {
        throw new AiError("configuration", "Модель AI-сценария не настроена.");
      }

      const fields = getAiProviderSettingFields(adapter.settingFields);
      const credentials = parseAiCredentials(decrypted, adapter.credentialFields);
      const parameters = {
        ...parseAiParameters(config.settings.settings, fields, { applyDefaults: true }),
        ...parseAiParameters(profile.parameters, fields, { allowMissingRequired: true }),
        ...parseAiParameters(input.overrides ?? {}, fields, { allowMissingRequired: true }),
      };
      const timeoutMs = typeof parameters.timeoutMs === "number" ? parameters.timeoutMs : 30_000;
      const result = await runAiWithTimeout(timeoutMs, (signal) => operation(adapter, {
        messages: input.messages, modelId: modelId!, parameters,
      }, { credentials, signal }));
      await writeLog({
        scenarioProfileId: profile.id, profileKey: input.profileKey, providerCode,
        modelId: result.modelId, status: "success", latencyMs: now() - startedAt,
        usage: result.usage, providerRequestId: result.providerRequestId,
      });
      return result;
    } catch (error) {
      const normalized = normalizeAiError(error);
      await writeLog({
        scenarioProfileId: profile?.id ?? null, profileKey: input.profileKey,
        providerCode, modelId, status: "failure", latencyMs: now() - startedAt,
        errorCode: normalized.code,
      });
      throw normalized;
    }
  }

  return {
    generateText(input: ServiceInput) {
      return run(input, (adapter, request, context) => adapter.generateText(request, context));
    },
    async generateObject<T>(input: ServiceInput & {
      schema: Record<string, unknown>;
      validate: (value: unknown) => value is T;
    }) {
      const result = await run(input, async (adapter, request, context) => {
        const generated = await adapter.generateObject({ ...request, schema: input.schema }, context);
        if (!input.validate(generated.value)) {
          throw new AiError("invalid-response", "AI-провайдер вернул ответ неверного формата.");
        }
        return generated;
      });
      return { ...result, value: result.value as T };
    },
  };
}

export const aiService = createAiService({
  getProfile: getEnabledAiScenarioProfile,
  getProviderConfig: getAiProviderRuntimeConfig,
  getAdapter: (code) => aiProviderRegistry.get(code),
  decryptCredentials: decryptAiCredentials,
  writeCallLog: createAiCallLog,
});

export const generateAiText = aiService.generateText;
export const generateAiObject = aiService.generateObject;
