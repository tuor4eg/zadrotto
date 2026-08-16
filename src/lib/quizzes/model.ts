import type { MediaType } from "@/lib/media/types";

export type QuizState = "scheduled" | "active" | "finished" | "disabled";
export type ActiveQuiz = {
  id: number;
  question: string | null;
  imageUrl: string | null;
  mediaTypes: MediaType[];
  startsAt: string;
  endsAt: string;
};
export type ActiveQuizContext = Pick<ActiveQuiz, "id" | "mediaTypes">;

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
