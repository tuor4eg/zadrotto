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
};

function pluralizeRu(value: number, forms: [string, string, string]) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function formatQuizTimeRemaining(endsAt: string | Date, now = new Date()) {
  const totalMinutes = Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 60_000),
  );
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    `${days} ${pluralizeRu(days, ["день", "дня", "дней"])}`,
    `${hours} ${pluralizeRu(hours, ["час", "часа", "часов"])}`,
    `${minutes} ${pluralizeRu(minutes, ["минута", "минуты", "минут"])}`,
  ];
  const firstNonZeroPart = [days, hours, minutes].findIndex((value) => value > 0);

  return `Осталось ${parts.slice(firstNonZeroPart === -1 ? -1 : firstNonZeroPart).join(" ")}`;
}

export function calculateAuthorQuizStatistics(rows: readonly {
  outcome: QuizParticipantOutcome;
  attemptsRemaining: number;
  attemptLimit: number;
  isWinner: boolean;
}[]): AuthorQuizStatistics {
  let correctCount = 0;
  let firstTryCorrectCount = 0;
  let currentCorrectStreak = 0;
  let bestCorrectStreak = 0;
  let winnerCount = 0;

  for (const row of rows) {
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
