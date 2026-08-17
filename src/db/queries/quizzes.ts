import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, mediaTypes, quizMediaTypes, quizParticipants, quizzes } from "@/db/schema";
import { containsNormalizedSearchSql } from "@/db/search";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveQuizImageUrl } from "@/lib/quizzes/images";
import { getQuizState, isQuizMediaTypeAllowed, type ActiveQuiz } from "@/lib/quizzes/model";

export type QuizWriteInput = { question: string | null; imageObjectKey: string | null; answerMediaItemId: number; mediaTypes: string[]; startsAt: Date; endsAt: Date; enabled: boolean };

async function mediaTypesForQuizIds(ids: number[]) {
  if (!ids.length) return new Map<number, string[]>();
  const rows = await db.select().from(quizMediaTypes).where(inArray(quizMediaTypes.quizId, ids));
  const result = new Map<number, string[]>();
  for (const row of rows) result.set(row.quizId, [...(result.get(row.quizId) ?? []), row.mediaType]);
  return result;
}
export async function getAdminQuizzes() {
  const rows = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).orderBy(asc(quizzes.startsAt));
  const types = await mediaTypesForQuizIds(rows.map(({ quiz }) => quiz.id));
  return rows.map(({ quiz, ...rest }) => ({ ...quiz, ...rest, mediaTypes: types.get(quiz.id) ?? [], imageUrl: resolveQuizImageUrl(quiz.imageObjectKey), state: getQuizState(quiz) }));
}
export async function getAdminQuizById(id: number) {
  const [row] = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).where(eq(quizzes.id, id)).limit(1);
  if (!row) return null;
  const types = await mediaTypesForQuizIds([id]);
  return { ...row.quiz, answerTitle: row.answerTitle, answerMediaType: row.answerMediaType, mediaTypes: types.get(id) ?? [], imageUrl: resolveQuizImageUrl(row.quiz.imageObjectKey) };
}
async function assertInput(executor: Pick<typeof db, "select">, input: QuizWriteInput) {
  if ((!input.question?.trim() && !input.imageObjectKey) || input.startsAt >= input.endsAt) throw new Error("invalid-quiz");
  const [answer] = await executor.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, input.answerMediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
  if (!answer || !isQuizMediaTypeAllowed(input.mediaTypes, answer.mediaType)) throw new Error("invalid-answer");
}
export async function createQuiz(input: QuizWriteInput) {
  return db.transaction(async (tx) => { await assertInput(tx, input); const [row] = await tx.insert(quizzes).values({ question: input.question, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, enabled: input.enabled }).returning(); if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: row!.id, mediaType }))); return row!; });
}
export async function updateQuiz(id: number, input: QuizWriteInput) {
  return db.transaction(async (tx) => { await assertInput(tx, input); const [row] = await tx.update(quizzes).set({ question: input.question, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, enabled: input.enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning(); if (!row) return null; await tx.delete(quizMediaTypes).where(eq(quizMediaTypes.quizId, id)); if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: id, mediaType }))); return row; });
}
export async function deleteQuiz(id: number) { const [row] = await db.delete(quizzes).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function setQuizEnabled(id: number, enabled: boolean) { const [row] = await db.update(quizzes).set({ enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function getActiveQuiz(now?: Date): Promise<ActiveQuiz | null> {
  const currentTime = now ?? sql`now()`;
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1);
  if (!quiz) return null; const types = await mediaTypesForQuizIds([quiz.id]);
  return { id: quiz.id, question: quiz.question, imageUrl: resolveQuizImageUrl(quiz.imageObjectKey), mediaTypes: types.get(quiz.id) ?? [], startsAt: quiz.startsAt.toISOString(), endsAt: quiz.endsAt.toISOString() };
}
export async function isQuizParticipant(quizId: number, authorId: number) {
  const [participant] = await db
    .select({ authorId: quizParticipants.authorId })
    .from(quizParticipants)
    .where(and(
      eq(quizParticipants.quizId, quizId),
      eq(quizParticipants.authorId, authorId),
    ))
    .limit(1);
  return Boolean(participant);
}
export async function getParticipatingActiveQuiz(authorId: number, now?: Date) {
  const active = await getActiveQuiz(now);
  if (!active || !(await isQuizParticipant(active.id, authorId))) return null;
  return active;
}
export async function joinActiveQuiz(authorId: number, now?: Date) {
  const active = await getActiveQuiz(now);
  if (!active) return null;
  await db.insert(quizParticipants).values({
    quizId: active.id,
    authorId,
  }).onConflictDoNothing();
  return active;
}
export async function checkQuizGuess(titleId: number, authorId: number, now?: Date) {
  const active = await getActiveQuiz(now); if (!active) return { kind: "missing" as const };
  if (!(await isQuizParticipant(active.id, authorId))) return { kind: "not-participant" as const };
  const [title] = await db.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, titleId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
  if (!title) return { kind: "title-missing" as const }; if (!isQuizMediaTypeAllowed(active.mediaTypes, title.mediaType)) return { kind: "invalid-type" as const };
  const [answer] = await db.select({ answerMediaItemId: quizzes.answerMediaItemId }).from(quizzes).where(eq(quizzes.id, active.id)).limit(1);
  return { kind: "result" as const, correct: answer?.answerMediaItemId === titleId };
}
export async function searchQuizAnswerTitles(query: string) {
  const condition = query.trim() ? or(containsNormalizedSearchSql(mediaItems.title, query), containsNormalizedSearchSql(mediaItems.originalTitle, query)) : undefined;
  return db.select({ id: mediaItems.id, title: mediaItems.title, originalTitle: mediaItems.originalTitle, releaseYear: mediaItems.releaseYear, mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true), condition)).orderBy(asc(mediaItems.title)).limit(20);
}
export async function isAssignedQuizImageObjectKey(key: string) { const [row] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.imageObjectKey, key)).limit(1); return Boolean(row); }
