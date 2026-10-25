import "server-only";
import { runCreatorNameLocalizationFlow } from "./name-localization-flow";
import { getCreatorNameLocalizationContext, prepareCreatorNameLocalizationBatch, saveCreatorNameLocalizationBatch } from "@/db/queries/creator-name-localization";
import { getEnabledAiScenarioProfile } from "@/db/queries/ai-scenarios";
import { generateAiObject } from "@/lib/ai/service";
import { AiError } from "@/lib/ai/types";
import { checkFixedWindowRateLimits } from "@/lib/rate-limits/redis";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { CREATOR_NAME_LOCALIZATION_TYPE, CREATOR_NAME_LOCALIZATION_SCENARIO_KEY, CREATOR_NAME_LOCALIZATION_PROMPT, CREATOR_NAME_LOCALIZATION_SCHEMA, parseCreatorNameLocalizationPayload, isCreatorNameLocalizationResponse, type CreatorNameLocalizationPayload } from "./name-localization";
export const creatorNameLocalizationHandler: JobHandlerDefinition<CreatorNameLocalizationPayload> = {
  type: CREATOR_NAME_LOCALIZATION_TYPE, label: "Локализация имён персон", defaultMaxAttempts: 5, defaultTimeoutSeconds: 300,
  parsePayload(value) {
    try {
      return parseCreatorNameLocalizationPayload(value);
    }
    catch (cause) {
      throw new JobError("invalid-payload", "Некорректные параметры локализации имён.", { retryable: false, cause });
    }
  },
  async execute({ payload, runId, lockToken, signal }) {
    if (!lockToken)
      throw new JobError("lease-lost", "Задача не получила блокировку.", { retryable: false });
    const profile = await getEnabledAiScenarioProfile(CREATOR_NAME_LOCALIZATION_SCENARIO_KEY);
    if (!profile)
      throw new JobError("ai-scenario-disabled", "Настройте и включите ИИ-сценарий локализации имён персон.", { retryable: false });
    const guard = { runId, lockToken };
    const batch = await prepareCreatorNameLocalizationBatch(payload, guard);
    if (!batch.length)
      return;
    const rate = await checkFixedWindowRateLimits([
      { keyPrefix: "ai-job:creator-name-localization", subject: "global", window: "minute", limit: payload.requestsPerMinute },
      { keyPrefix: "ai-job:creator-name-localization", subject: "global", window: "day", limit: payload.requestsPerDay },
    ]);
    if (!rate.ok)
      throw new JobError("rate-limit-unavailable", "Не удалось проверить лимит ИИ.", { deferSeconds: 60 });
    if (!rate.allowed)
      throw new JobError("ai-rate-limit", "Лимит ИИ временно исчерпан.", { deferSeconds: rate.retryAfterSeconds });
    const context = await getCreatorNameLocalizationContext(batch.map(row => row.id));
    signal.throwIfAborted();
    try {
      await runCreatorNameLocalizationFlow({ ids: batch.map(row => row.id), signal, generate: async () => (await generateAiObject({
          profileKey: CREATOR_NAME_LOCALIZATION_SCENARIO_KEY,
          messages: [{ role: "system", content: CREATOR_NAME_LOCALIZATION_PROMPT }, { role: "user", content: JSON.stringify({ instruction: profile.instruction, persons: batch.map(row => ({ id: row.id, name: row.name, works: context.filter(work => work.id === row.id).map(({ role, title }) => ({ role, title })) })) }) }],
          schema: CREATOR_NAME_LOCALIZATION_SCHEMA, validate: (value): value is import("./name-localization").CreatorNameLocalizationResponse => isCreatorNameLocalizationResponse(value, batch.map(row => row.id)),
        })).value, save: response => saveCreatorNameLocalizationBatch({ guard, expected: batch, response }) });
    }
    catch (cause) {
      if (cause instanceof AiError)
        throw new JobError(cause.code, "Не удалось локализовать имена персон.", { cause, retryable: !["configuration", "authentication"].includes(cause.code) });
      throw cause;
    }
  },
};
