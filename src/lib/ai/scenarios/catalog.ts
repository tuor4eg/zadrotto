export const AI_SCENARIO_KEYS = {
  SUGGEST_SERIES: "suggest_series",
} as const;

export const AI_SCENARIOS = {
  suggest_series: {
    key: "suggest_series",
    name: "Предложить серии",
    defaultInstruction:
      "Предложи подходящие серии для записи по её названию, описанию и другим заполненным полям. Выбирай только из переданного списка серий.",
    defaultConfig: {
      resultLimit: 3,
    },
  },
} as const;

export type AiScenarioCatalogKey = keyof typeof AI_SCENARIOS;
export type SuggestSeriesScenarioConfig = {
  resultLimit: number;
};

export function getAiScenarioDefinition(key: string) {
  return Object.prototype.hasOwnProperty.call(AI_SCENARIOS, key)
    ? AI_SCENARIOS[key as AiScenarioCatalogKey]
    : null;
}

export function listAiScenarioCatalogEntries() {
  return Object.values(AI_SCENARIOS);
}

export function parseSuggestSeriesConfig(value: unknown): SuggestSeriesScenarioConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...AI_SCENARIOS.suggest_series.defaultConfig };
  }
  const resultLimit = (value as Record<string, unknown>).resultLimit ??
    AI_SCENARIOS.suggest_series.defaultConfig.resultLimit;
  if (!Number.isInteger(resultLimit) || Number(resultLimit) < 1 || Number(resultLimit) > 10) {
    throw new Error("INVALID_SUGGEST_SERIES_CONFIG");
  }
  return { resultLimit: Number(resultLimit) };
}
