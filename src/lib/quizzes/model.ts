import type { MediaType } from "@/lib/media/types";

export type QuizState = "scheduled" | "active" | "finished" | "disabled";
export type ActiveQuiz = {
  id: number;
  question: string | null;
  imageUrl: string | null;
  mediaTypes: MediaType[];
  startsAt: string;
  endsAt: string;
  attemptLimit: number;
};
export type ActiveQuizContext = Pick<ActiveQuiz, "id" | "mediaTypes">;
export type QuizHistoryEntry = {
  answer: {
    averageScore: number | null;
    code: string;
    coverThumbUrl: string | null;
    coverUrl: string | null;
    id: number;
    mediaType: MediaType;
    ratingsCount: number;
    releaseYear: number | null;
    title: string;
  };
  imageUrl: string | null;
  question: string | null;
};

export type QuizParticipantOutcome = "correct" | "exhausted";
export type QuizParticipantState = {
  quizId: number;
  attemptLimit: number;
  attemptsRemaining: number;
  completed: boolean;
  outcome: QuizParticipantOutcome | null;
  isWinner: boolean;
};

export type AuthorQuizStatistics = {
  playedCount: number;
  correctCount: number;
  accuracyPercent: number;
  firstTryCorrectCount: number;
  currentCorrectStreak: number;
  bestCorrectStreak: number;
  winnerCount: number;
  totalTimeSeconds: number;
};

export function formatQuizTimeRemaining(endsAt: string | Date, now = new Date()) {
  const totalSeconds = Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 1_000),
  );
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    `${days} д.`,
    `${hours} ч.`,
    `${minutes} м.`,
    `${seconds} с.`,
  ];
  const firstNonZeroPart = [days, hours, minutes, seconds].findIndex((value) => value > 0);

  return `Осталось ${parts.slice(firstNonZeroPart === -1 ? -1 : firstNonZeroPart).join(" ")}`;
}

export function formatQuizDuration(totalSeconds: number | null) {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "—";

  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(roundedSeconds / 86_400);
  const hours = Math.floor((roundedSeconds % 86_400) / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const seconds = roundedSeconds % 60;
  const parts = [
    days > 0 ? `${days} д.` : null,
    hours > 0 || days > 0 ? `${hours} ч.` : null,
    minutes > 0 || hours > 0 || days > 0 ? `${minutes} м.` : null,
    `${seconds} с.`,
  ];

  return parts.filter(Boolean).join(" ");
}

export function calculateAuthorQuizStatistics(rows: readonly {
  outcome: QuizParticipantOutcome;
  attemptsRemaining: number;
  attemptLimit: number;
  durationSeconds: number;
  isWinner: boolean;
}[]): AuthorQuizStatistics {
  let correctCount = 0;
  let firstTryCorrectCount = 0;
  let currentCorrectStreak = 0;
  let bestCorrectStreak = 0;
  let winnerCount = 0;
  let totalTimeSeconds = 0;

  for (const row of rows) {
    totalTimeSeconds += Math.max(0, row.durationSeconds);
    if (row.outcome === "correct") {
      correctCount += 1;
      currentCorrectStreak += 1;
      bestCorrectStreak = Math.max(bestCorrectStreak, currentCorrectStreak);
      if (row.attemptsRemaining === row.attemptLimit) firstTryCorrectCount += 1;
      if (row.isWinner) winnerCount += 1;
    } else {
      currentCorrectStreak = 0;
    }
  }

  return {
    playedCount: rows.length,
    correctCount,
    accuracyPercent: rows.length === 0 ? 0 : Math.round((correctCount / rows.length) * 100),
    firstTryCorrectCount,
    currentCorrectStreak,
    bestCorrectStreak,
    winnerCount,
    totalTimeSeconds,
  };
}

export function isQuizMediaTypeAllowed(
  quizMediaTypes: readonly MediaType[],
  mediaType: MediaType,
) {
  return quizMediaTypes.length === 0 || quizMediaTypes.includes(mediaType);
}

export function getQuizState(input: { enabled: boolean; startsAt: Date; endsAt: Date }, now = new Date()): QuizState {
  if (!input.enabled) return "disabled";
  if (input.startsAt > now) return "scheduled";
  if (input.endsAt <= now) return "finished";
  return "active";
}
