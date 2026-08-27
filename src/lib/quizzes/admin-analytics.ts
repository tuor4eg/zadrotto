import type { QuizParticipantOutcome } from "@/lib/quizzes/model";

export const ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE = 50;

export type AdminQuizParticipantStatus =
  | "winner"
  | "correct"
  | "exhausted"
  | "answering"
  | "not-started";

export function calculateUsedQuizAttempts(input: {
  attemptLimit: number;
  attemptsRemaining: number;
  outcome: QuizParticipantOutcome | null;
}) {
  const usedAttempts = input.attemptLimit - input.attemptsRemaining;

  return input.outcome === "correct" ? usedAttempts + 1 : usedAttempts;
}

export function getAdminQuizParticipantStatus(input: {
  attemptLimit: number;
  attemptsRemaining: number;
  isWinner: boolean;
  outcome: QuizParticipantOutcome | null;
}): AdminQuizParticipantStatus {
  if (input.isWinner) return "winner";
  if (input.outcome === "correct") return "correct";
  if (input.outcome === "exhausted") return "exhausted";
  if (input.attemptsRemaining < input.attemptLimit) return "answering";

  return "not-started";
}

export function formatQuizDuration(totalSeconds: number | null) {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "—";

  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(roundedSeconds / 86_400);
  const hours = Math.floor((roundedSeconds % 86_400) / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const seconds = roundedSeconds % 60;
  const parts = [
    days > 0 ? `${days} дн.` : null,
    hours > 0 || days > 0 ? `${hours} ч.` : null,
    minutes > 0 || hours > 0 || days > 0 ? `${minutes} мин.` : null,
    `${seconds} сек.`,
  ];

  return parts.filter(Boolean).join(" ");
}
