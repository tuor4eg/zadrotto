import type { QuizParticipantOutcome } from "@/lib/quizzes/model";

export { formatQuizDuration } from "@/lib/quizzes/model";

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
