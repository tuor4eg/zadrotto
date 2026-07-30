import "server-only";

import { getAiFranchiseCandidates } from "@/db/queries/franchises";
import { getEnabledAiScenarioProfile } from "@/db/queries/ai-scenarios";
import { generateAiObject } from "@/lib/ai/service";
import { AiError } from "@/lib/ai/types";
import {
  AI_SCENARIOS,
  AI_SCENARIO_KEYS,
  parseSuggestSeriesConfig,
} from "./catalog";

export type SuggestFranchisesMediaInput = {
  title: string;
  originalTitle?: string | null;
  aliases?: string[];
  mediaType: string;
  mediaTypeLabel?: string | null;
  releaseYear?: number | null;
  description?: string | null;
  mediaCarrier?: string | null;
  metadata?: Record<string, unknown>;
  selectedFranchiseIds?: number[];
};

type SuggestFranchisesResponse = {
  franchiseIds: number[];
};

const MAX_PROMPT_PAYLOAD_LENGTH = 250_000;

function createSuggestFranchisesResponseValidator(resultLimit: number) {
  return (value: unknown): value is SuggestFranchisesResponse => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== 1 || !Object.hasOwn(source, "franchiseIds")) return false;
  const franchiseIds = source.franchiseIds;
  return Array.isArray(franchiseIds) &&
    franchiseIds.length <= resultLimit &&
    franchiseIds.every((id) => Number.isSafeInteger(id) && Number(id) > 0);
  };
}

export async function suggestFranchisesForMediaItem(
  input: SuggestFranchisesMediaInput,
  context: { currentAuthorId?: number } = {},
) {
  const profile = await getEnabledAiScenarioProfile(AI_SCENARIO_KEYS.SUGGEST_SERIES);
  if (!profile) {
    throw new AiError("configuration", "Сценарий «Предложить серии» не настроен или выключен.");
  }
  const { resultLimit } = parseSuggestSeriesConfig(profile.config);
  const candidates = await getAiFranchiseCandidates(context.currentAuthorId);
  const selectedIds = new Set(input.selectedFranchiseIds ?? []);
  const availableIds = new Set(candidates.map((candidate) => candidate.id));
  const instruction = profile.instruction?.trim() ||
    AI_SCENARIOS.suggest_series.defaultInstruction;
  if (instruction.length > 8_000) {
    throw new AiError("configuration", "Инструкция AI-сценария слишком длинная.");
  }

  const payload = JSON.stringify({
    record: input,
    availableFranchises: candidates.map((candidate) => ({
      ...candidate,
      path: candidate.path.slice(0, 1_000),
      title: candidate.title.slice(0, 300),
      originalTitle: candidate.originalTitle?.slice(0, 300) ?? null,
      description: candidate.description?.slice(0, 2_000) ?? null,
      mediaItems: candidate.mediaItems.map((item) => ({
        ...item,
        title: item.title.slice(0, 300),
      })),
    })),
  });
  if (payload.length + instruction.length > MAX_PROMPT_PAYLOAD_LENGTH) {
    throw new AiError(
      "configuration",
      "Список серий слишком велик для одного AI-запроса.",
    );
  }

  const result = await generateAiObject({
    profileKey: AI_SCENARIO_KEYS.SUGGEST_SERIES,
    messages: [
      {
        role: "system",
        content: [
          instruction,
          `Верни от 0 до ${resultLimit} наиболее подходящих серий.`,
          "Используй только числовые ID из переданного списка. Не выдумывай новые серии.",
          "Если уверенного совпадения нет, верни пустой список.",
        ].join("\n"),
      },
      {
        role: "user",
        content: payload,
      },
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["franchiseIds"],
      properties: {
        franchiseIds: {
          type: "array",
          minItems: 0,
          maxItems: resultLimit,
          uniqueItems: true,
          items: { type: "integer", minimum: 1 },
        },
      },
    },
    validate: createSuggestFranchisesResponseValidator(resultLimit),
  });

  return {
    franchiseIds: [...new Set(result.value.franchiseIds)]
      .filter((id) => availableIds.has(id) && !selectedIds.has(id))
      .slice(0, resultLimit),
  };
}
