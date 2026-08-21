import { and, asc, eq, gt, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runInDomainEventTransaction } from "@/db/transaction";
import { mediaItems, mediaTypes, quizMediaTypes, quizParticipants, quizzes } from "@/db/schema";
import { containsNormalizedSearchSql } from "@/db/search";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveQuizImageUrl } from "@/lib/quizzes/images";
import { calculateAuthorQuizStatistics, getQuizState, isQuizMediaTypeAllowed, type ActiveQuiz, type QuizParticipantOutcome, type QuizParticipantState } from "@/lib/quizzes/model";

export type QuizWriteInput = { question: string | null; imageObjectKey: string | null; answerMediaItemId: number; mediaTypes: string[]; startsAt: Date; endsAt: Date; attemptLimit: number; enabled: boolean };

async function mediaTypesForQuizIds(ids: number[]) {
  if (!ids.length) return new Map<number, string[]>();
  const rows = await db.select().from(quizMediaTypes).where(inArray(quizMediaTypes.quizId, ids));
  const result = new Map<number, string[]>();
  for (const row of rows) result.set(row.quizId, [...(result.get(row.quizId) ?? []), row.mediaType]);
  return result;
}
async function participantQuizIds(ids: number[]) {
  if (!ids.length) return new Set<number>();
  const rows = await db.selectDistinct({ quizId: quizParticipants.quizId }).from(quizParticipants).where(inArray(quizParticipants.quizId, ids));
  return new Set(rows.map((row) => row.quizId));
}
export async function getAdminQuizzes() {
  const rows = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).orderBy(asc(quizzes.startsAt));
  const ids = rows.map(({ quiz }) => quiz.id); const [types, participantIds] = await Promise.all([mediaTypesForQuizIds(ids), participantQuizIds(ids)]);
  return rows.map(({ quiz, ...rest }) => ({ ...quiz, ...rest, mediaTypes: types.get(quiz.id) ?? [], hasParticipants: participantIds.has(quiz.id), imageUrl: resolveQuizImageUrl(quiz.imageObjectKey), state: getQuizState(quiz) }));
}
export async function getAdminQuizById(id: number) {
  const [row] = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).where(eq(quizzes.id, id)).limit(1);
  if (!row) return null;
  const [types, participantIds] = await Promise.all([mediaTypesForQuizIds([id]), participantQuizIds([id])]);
  return { ...row.quiz, answerTitle: row.answerTitle, answerMediaType: row.answerMediaType, mediaTypes: types.get(id) ?? [], hasParticipants: participantIds.has(id), imageUrl: resolveQuizImageUrl(row.quiz.imageObjectKey) };
}
async function assertInput(executor: Pick<typeof db, "select">, input: QuizWriteInput) {
  if ((!input.question?.trim() && !input.imageObjectKey) || input.startsAt >= input.endsAt || !Number.isSafeInteger(input.attemptLimit) || input.attemptLimit < 1 || input.attemptLimit > 10) throw new Error("invalid-quiz");
  const [answer] = await executor.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, input.answerMediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
  if (!answer || !isQuizMediaTypeAllowed(input.mediaTypes, answer.mediaType)) throw new Error("invalid-answer");
}
export async function createQuiz(input: QuizWriteInput) {
  return db.transaction(async (tx) => { await assertInput(tx, input); const [row] = await tx.insert(quizzes).values({ question: input.question, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, attemptLimit: input.attemptLimit, enabled: input.enabled }).returning(); if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: row!.id, mediaType }))); return row!; });
}
export async function updateQuiz(id: number, input: QuizWriteInput) {
  return db.transaction(async (tx) => { await assertInput(tx, input); const [current] = await tx.select({ attemptLimit: quizzes.attemptLimit }).from(quizzes).where(eq(quizzes.id, id)).limit(1).for("update"); if (!current) return null; if (current.attemptLimit !== input.attemptLimit) { const [participant] = await tx.select({ authorId: quizParticipants.authorId }).from(quizParticipants).where(eq(quizParticipants.quizId, id)).limit(1); if (participant) throw new Error("attempt-limit-locked"); } const [row] = await tx.update(quizzes).set({ question: input.question, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, attemptLimit: input.attemptLimit, enabled: input.enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning(); await tx.delete(quizMediaTypes).where(eq(quizMediaTypes.quizId, id)); if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: id, mediaType }))); return row!; });
}
export async function deleteQuiz(id: number) { const [row] = await db.delete(quizzes).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function setQuizEnabled(id: number, enabled: boolean) { const [row] = await db.update(quizzes).set({ enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function getActiveQuiz(now?: Date): Promise<ActiveQuiz | null> {
  const currentTime = now ?? sql`now()`;
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1);
  if (!quiz) return null; const types = await mediaTypesForQuizIds([quiz.id]);
  return { id: quiz.id, question: quiz.question, imageUrl: resolveQuizImageUrl(quiz.imageObjectKey), mediaTypes: types.get(quiz.id) ?? [], startsAt: quiz.startsAt.toISOString(), endsAt: quiz.endsAt.toISOString(), attemptLimit: quiz.attemptLimit };
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
  const [active, participant] = await Promise.all([
    getActiveQuiz(now),
    getActiveQuizParticipantState(authorId, now),
  ]);
  if (!active || !participant || participant.completed || participant.quizId !== active.id) return null;
  return active;
}
export async function joinActiveQuiz(authorId: number, now?: Date) {
  const joined = await db.transaction(async (tx) => {
    const currentTime = now ?? sql`now()`;
    const [active] = await tx.select({ id: quizzes.id, attemptLimit: quizzes.attemptLimit }).from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1).for("update");
    if (!active) return false;
    await tx.insert(quizParticipants).values({ quizId: active.id, authorId, attemptsRemaining: active.attemptLimit }).onConflictDoNothing();
    return true;
  });
  if (!joined) return null;
  return getActiveQuizParticipantState(authorId, now);
}

function mapParticipantState(row: { quizId: number; attemptLimit: number; attemptsRemaining: number; outcome: string | null; isWinner: boolean }): QuizParticipantState {
  return { quizId: row.quizId, attemptLimit: row.attemptLimit, attemptsRemaining: row.attemptsRemaining, completed: row.outcome !== null, outcome: row.outcome as QuizParticipantState["outcome"], isWinner: row.isWinner };
}

export async function getActiveQuizParticipantState(authorId: number, now?: Date): Promise<QuizParticipantState | null> {
  const currentTime = now ?? sql`now()`;
  const [row] = await db.select({ quizId: quizzes.id, attemptLimit: quizzes.attemptLimit, attemptsRemaining: quizParticipants.attemptsRemaining, outcome: quizParticipants.outcome, isWinner: quizParticipants.isWinner }).from(quizzes).innerJoin(quizParticipants, and(eq(quizParticipants.quizId, quizzes.id), eq(quizParticipants.authorId, authorId))).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1);
  return row ? mapParticipantState(row) : null;
}
export async function getAuthorQuizStatistics(authorId: number) {
  const rows = await db.select({ outcome: quizParticipants.outcome, attemptsRemaining: quizParticipants.attemptsRemaining, attemptLimit: quizzes.attemptLimit, isWinner: quizParticipants.isWinner }).from(quizParticipants).innerJoin(quizzes, eq(quizzes.id, quizParticipants.quizId)).where(and(eq(quizParticipants.authorId, authorId), isNotNull(quizParticipants.completedAt), isNotNull(quizParticipants.outcome))).orderBy(asc(quizParticipants.completedAt), asc(quizParticipants.quizId));
  return calculateAuthorQuizStatistics(rows.map((row) => ({ ...row, outcome: row.outcome as QuizParticipantOutcome })));
}
export async function checkQuizGuess(titleId: number, authorId: number, now?: Date) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const currentTime = now ?? sql`now()`;
    const [quiz] = await tx.select().from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1).for("update");
    if (!quiz) return { kind: "missing" as const };
    const [participant] = await tx.select().from(quizParticipants).where(and(eq(quizParticipants.quizId, quiz.id), eq(quizParticipants.authorId, authorId))).limit(1).for("update");
    if (!participant) return { kind: "not-participant" as const };
    if (participant.outcome) return { kind: "completed" as const, participant: mapParticipantState({ ...participant, attemptLimit: quiz.attemptLimit }) };
    const [title] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, titleId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
    if (!title) return { kind: "title-missing" as const }; const types = await tx.select({ mediaType: quizMediaTypes.mediaType }).from(quizMediaTypes).where(eq(quizMediaTypes.quizId, quiz.id)); if (!isQuizMediaTypeAllowed(types.map((item) => item.mediaType), title.mediaType)) return { kind: "invalid-type" as const };
    const correct = quiz.answerMediaItemId === titleId;
    const attemptsRemaining = correct ? participant.attemptsRemaining : participant.attemptsRemaining - 1;
    const outcome = correct ? "correct" as const : attemptsRemaining === 0 ? "exhausted" as const : null;
    const [existingWinner] = correct ? await tx.select({ authorId: quizParticipants.authorId }).from(quizParticipants).where(and(eq(quizParticipants.quizId, quiz.id), eq(quizParticipants.isWinner, true))).limit(1) : [];
    const [updated] = await tx.update(quizParticipants).set({ attemptsRemaining, outcome, completedAt: outcome ? new Date() : null, isWinner: correct && !existingWinner }).where(and(eq(quizParticipants.quizId, quiz.id), eq(quizParticipants.authorId, authorId))).returning();
    if (outcome) {
      await appendEvent({
        actorAuthorId: authorId,
        aggregateId: `${quiz.id}:${authorId}`,
        aggregateType: "quiz-participant",
        payload: { authorId, outcome, quizId: quiz.id },
        type: "quiz.completed",
      });
    }
    return { kind: "result" as const, correct, participant: mapParticipantState({ ...updated!, attemptLimit: quiz.attemptLimit }) };
  });
}
export async function searchQuizAnswerTitles(query: string, mediaTypeFilter: readonly string[] = []) {
  const condition = query.trim()
    ? or(
        containsNormalizedSearchSql(mediaItems.title, query),
        containsNormalizedSearchSql(mediaItems.originalTitle, query),
      )
    : undefined
  const typeCondition = mediaTypeFilter.length > 0
    ? inArray(mediaItems.mediaType, [...mediaTypeFilter])
    : undefined
  return db
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      releaseYear: mediaItems.releaseYear,
      mediaType: mediaItems.mediaType,
    })
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .where(and(
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      eq(mediaTypes.isPubliclyAvailable, true),
      condition,
      typeCondition,
    ))
    .orderBy(asc(mediaItems.title))
    .limit(20)
}
export async function isAssignedQuizImageObjectKey(key: string) { const [row] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.imageObjectKey, key)).limit(1); return Boolean(row); }
