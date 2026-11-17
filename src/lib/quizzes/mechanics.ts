import { createMosaicState, isMosaicSeed } from "./mosaic";

type FirstAnswerState = { attemptLimit: number; attemptsRemaining: number; wrongAnswers?: number };

/** Small extension point for question rules; persistence and auth belong to the shared quiz service. */
export const QUIZ_MECHANICS = {
  classic: {
    label: "Обычный вопрос",
    createState: () => null,
    isFirstAnswer: (state: FirstAnswerState) => state.attemptsRemaining === state.attemptLimit,
    validateConfig: (config: unknown) => config == null,
  },
  mosaic: {
    label: "Угадай по мозаике",
    createState: createMosaicState,
    isFirstAnswer: (state: FirstAnswerState) => state.wrongAnswers === 0,
    validateConfig: (config: unknown) => !!config && typeof config === "object" && "seed" in config && isMosaicSeed(config.seed),
  },
} as const;

export type QuizType = keyof typeof QUIZ_MECHANICS;
