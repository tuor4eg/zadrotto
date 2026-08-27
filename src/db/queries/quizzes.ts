import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runInDomainEventTransaction } from "@/db/transaction";
import { authors, mediaItems, mediaTypes, quizMediaTypes, quizParticipants, quizzes, ratings } from "@/db/schema";
import { containsNormalizedSearchSql } from "@/db/search";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveQuizImageUrl } from "@/lib/quizzes/images";
import { resolveCoverUrl } from "@/lib/services/minio";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE, calculateUsedQuizAttempts, getAdminQuizParticipantStatus } from "@/lib/quizzes/admin-analytics";
import { calculateAuthorQuizStatistics, getQuizState, isQuizMediaTypeAllowed, type ActiveQuiz, type QuizHistoryEntry, type QuizParticipantOutcome, type QuizParticipantState } from "@/lib/quizzes/model";

export type QuizWriteInput = { question: string | null; comment: string | null; imageObjectKey: string | null; answerMediaItemId: number; mediaTypes: string[]; startsAt: Date; endsAt: Date; attemptLimit: number; enabled: boolean };

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
async function answeredQuizIds(ids: number[]) {
  if (!ids.length) return new Set<number>();
  const rows = await db.selectDistinct({ quizId: quizParticipants.quizId }).from(quizParticipants).innerJoin(quizzes, eq(quizzes.id, quizParticipants.quizId)).where(and(
    inArray(quizParticipants.quizId, ids),
    or(isNotNull(quizParticipants.outcome), lt(quizParticipants.attemptsRemaining, quizzes.attemptLimit)),
  ));
  return new Set(rows.map((row) => row.quizId));
}
export async function getAdminQuizzes() {
  const rows = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).orderBy(asc(quizzes.startsAt));
  const ids = rows.map(({ quiz }) => quiz.id); const [types, participantIds, answeredIds] = await Promise.all([mediaTypesForQuizIds(ids), participantQuizIds(ids), answeredQuizIds(ids)]);
  return rows.map(({ quiz, ...rest }) => ({ ...quiz, ...rest, mediaTypes: types.get(quiz.id) ?? [], hasAnswers: answeredIds.has(quiz.id), hasParticipants: participantIds.has(quiz.id), imageUrl: resolveQuizImageUrl(quiz.imageObjectKey), state: getQuizState(quiz) }));
}
export async function getAdminQuizById(id: number) {
  const [row] = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).where(eq(quizzes.id, id)).limit(1);
  if (!row) return null;
  const [types, participantIds, answeredIds] = await Promise.all([mediaTypesForQuizIds([id]), participantQuizIds([id]), answeredQuizIds([id])]);
  return { ...row.quiz, answerTitle: row.answerTitle, answerMediaType: row.answerMediaType, mediaTypes: types.get(id) ?? [], hasAnswers: answeredIds.has(id), hasParticipants: participantIds.has(id), imageUrl: resolveQuizImageUrl(row.quiz.imageObjectKey) };
}

export async function getAdminQuizContext(quizId: number) {
  const [row] = await db
    .select({
      answerCode: mediaItems.code,
      answerTitle: mediaItems.title,
      attemptLimit: quizzes.attemptLimit,
      enabled: quizzes.enabled,
      endsAt: quizzes.endsAt,
      id: quizzes.id,
      imageObjectKey: quizzes.imageObjectKey,
      question: quizzes.question,
      startsAt: quizzes.startsAt,
    })
    .from(quizzes)
    .innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId))
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!row) return null;

  const { imageObjectKey, ...context } = row;
  return {
    ...context,
    imageUrl: resolveQuizImageUrl(imageObjectKey),
    state: getQuizState(row),
  };
}

export async function getAdminQuizAggregates(quizId: number) {
  const [row] = await db
    .select({
      averageCorrectAnswerSeconds: sql<number | null>`(
        avg(extract(epoch from (${quizParticipants.completedAt} - ${quizParticipants.joinedAt})))
        filter (where ${quizParticipants.outcome} = 'correct')
      )::float`,
      correctCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} = 'correct')::int`,
      exhaustedCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} = 'exhausted')::int`,
      inProgressCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} is null)::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(quizParticipants)
    .where(eq(quizParticipants.quizId, quizId));

  return row ?? {
    averageCorrectAnswerSeconds: null,
    correctCount: 0,
    exhaustedCount: 0,
    inProgressCount: 0,
    totalCount: 0,
  };
}

export async function getAdminQuizWinner(quizId: number) {
  const [row] = await db
    .select({
      authorAvatarObjectKey: authors.avatarObjectKey,
      authorId: authors.id,
      authorName: authors.name,
      completedAt: quizParticipants.completedAt,
      secondsSinceJoined: sql<number>`extract(epoch from (${quizParticipants.completedAt} - ${quizParticipants.joinedAt}))::float`,
    })
    .from(quizParticipants)
    .innerJoin(authors, eq(authors.id, quizParticipants.authorId))
    .where(and(
      eq(quizParticipants.quizId, quizId),
      eq(quizParticipants.isWinner, true),
    ))
    .limit(1);

  return row ?? null;
}

export async function getAdminQuizParticipantPage(input: {
  quizId: number;
  requestedPage: number;
  totalCount: number;
}) {
  const totalPages = getTotalPages(input.totalCount, ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE);
  const page = clampPage(input.requestedPage, totalPages);
  const rows = await db
    .select({
      authorAvatarObjectKey: authors.avatarObjectKey,
      authorId: authors.id,
      authorName: authors.name,
      attemptLimit: quizzes.attemptLimit,
      attemptsRemaining: quizParticipants.attemptsRemaining,
      completedAt: quizParticipants.completedAt,
      isWinner: quizParticipants.isWinner,
      joinedAt: quizParticipants.joinedAt,
      outcome: quizParticipants.outcome,
      secondsSinceJoined: sql<number | null>`extract(epoch from (${quizParticipants.completedAt} - ${quizParticipants.joinedAt}))::float`,
      secondsSinceQuizStart: sql<number | null>`extract(epoch from (${quizParticipants.completedAt} - ${quizzes.startsAt}))::float`,
    })
    .from(quizParticipants)
    .innerJoin(authors, eq(authors.id, quizParticipants.authorId))
    .innerJoin(quizzes, eq(quizzes.id, quizParticipants.quizId))
    .where(eq(quizParticipants.quizId, input.quizId))
    .orderBy(
      sql`case
        when ${quizParticipants.isWinner} then 0
        when ${quizParticipants.outcome} = 'correct' then 1
        when ${quizParticipants.outcome} = 'exhausted' then 2
        else 3
      end`,
      asc(quizParticipants.completedAt),
      asc(quizParticipants.joinedAt),
      asc(quizParticipants.authorId),
    )
    .limit(ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE)
    .offset(getOffset(page, ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE));

  return {
    items: rows.map((row) => {
      const outcome = row.outcome as QuizParticipantOutcome | null;
      const participantState = { ...row, outcome };

      return {
        ...participantState,
        status: getAdminQuizParticipantStatus(participantState),
        usedAttempts: calculateUsedQuizAttempts(participantState),
      };
    }),
    page,
    pageSize: ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE,
    totalCount: input.totalCount,
    totalPages,
  };
}
async function assertInput(executor: Pick<typeof db, "select">, input: QuizWriteInput) {
  if ((!input.question?.trim() && !input.imageObjectKey) || input.mediaTypes.length === 0 || (input.comment?.length ?? 0) > 2000 || input.startsAt >= input.endsAt || !Number.isSafeInteger(input.attemptLimit) || input.attemptLimit < 1 || input.attemptLimit > 10) throw new Error("invalid-quiz");
  const [answer] = await executor.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, input.answerMediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
  if (!answer || !isQuizMediaTypeAllowed(input.mediaTypes, answer.mediaType)) throw new Error("invalid-answer");
}
export async function createQuiz(input: QuizWriteInput) {
  return db.transaction(async (tx) => { await assertInput(tx, input); const [row] = await tx.insert(quizzes).values({ question: input.question, comment: input.comment, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, attemptLimit: input.attemptLimit, enabled: input.enabled }).returning(); if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: row!.id, mediaType }))); return row!; });
}
export async function updateQuiz(id: number, input: QuizWriteInput) {
  return db.transaction(async (tx) => {
    await assertInput(tx, input);
    const [current] = await tx.select({ answerMediaItemId: quizzes.answerMediaItemId, attemptLimit: quizzes.attemptLimit }).from(quizzes).where(eq(quizzes.id, id)).limit(1).for("update");
    if (!current) return null;
    const currentMediaTypes = await tx.select({ mediaType: quizMediaTypes.mediaType }).from(quizMediaTypes).where(eq(quizMediaTypes.quizId, id));
    const mediaTypesChanged = currentMediaTypes.length !== input.mediaTypes.length
      || currentMediaTypes.some(({ mediaType }) => !input.mediaTypes.includes(mediaType));
    const answerConfigurationChanged = current.answerMediaItemId !== input.answerMediaItemId || mediaTypesChanged;
    if (current.attemptLimit !== input.attemptLimit) {
      const [participant] = await tx.select({ authorId: quizParticipants.authorId }).from(quizParticipants).where(eq(quizParticipants.quizId, id)).limit(1);
      if (participant) throw new Error("attempt-limit-locked");
    }
    if (answerConfigurationChanged) {
      const [answer] = await tx.select({ authorId: quizParticipants.authorId }).from(quizParticipants).where(and(
        eq(quizParticipants.quizId, id),
        or(isNotNull(quizParticipants.outcome), lt(quizParticipants.attemptsRemaining, current.attemptLimit)),
      )).limit(1);
      if (answer) throw new Error("answer-configuration-locked");
    }
    const [row] = await tx.update(quizzes).set({ question: input.question, comment: input.comment, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, attemptLimit: input.attemptLimit, enabled: input.enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning();
    await tx.delete(quizMediaTypes).where(eq(quizMediaTypes.quizId, id));
    if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: id, mediaType })));
    return row!;
  });
}
export async function deleteQuiz(id: number) { const [row] = await db.delete(quizzes).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function setQuizEnabled(id: number, enabled: boolean) { const [row] = await db.update(quizzes).set({ enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function getActiveQuiz(now?: Date): Promise<ActiveQuiz | null> {
  const currentTime = now ?? sql`now()`;
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1);
  if (!quiz) return null; const types = await mediaTypesForQuizIds([quiz.id]);
  return { id: quiz.id, question: quiz.question, imageUrl: resolveQuizImageUrl(quiz.imageObjectKey), mediaTypes: types.get(quiz.id) ?? [], startsAt: quiz.startsAt.toISOString(), endsAt: quiz.endsAt.toISOString(), attemptLimit: quiz.attemptLimit };
}
export async function getPreviousQuizHistory(now?: Date): Promise<QuizHistoryEntry | null> {
  const currentTime = now ?? sql`now()`;
  const [row] = await db
    .select({
      answerAverageScore: sql<number | null>`avg(${ratings.score})::float`,
      answerCode: mediaItems.code,
      answerCoverThumbUrl: mediaItems.coverThumbUrl,
      answerCoverUrl: mediaItems.coverUrl,
      answerId: mediaItems.id,
      answerMediaType: mediaItems.mediaType,
      answerRatingsCount: sql<number>`count(${ratings.id})::int`,
      answerReleaseYear: mediaItems.releaseYear,
      answerTitle: mediaItems.title,
      imageObjectKey: quizzes.imageObjectKey,
      question: quizzes.question,
    })
    .from(quizzes)
    .innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId))
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(
      eq(quizzes.enabled, true),
      lte(quizzes.endsAt, currentTime),
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      eq(mediaTypes.isPubliclyAvailable, true),
    ))
    .groupBy(quizzes.id, mediaItems.id)
    .orderBy(desc(quizzes.endsAt), desc(quizzes.id))
    .limit(1);

  if (!row) return null;

  return {
    answer: {
      averageScore: row.answerAverageScore,
      code: row.answerCode,
      coverThumbUrl: resolveCoverUrl(row.answerCoverThumbUrl),
      coverUrl: resolveCoverUrl(row.answerCoverUrl),
      id: row.answerId,
      mediaType: row.answerMediaType,
      ratingsCount: row.answerRatingsCount,
      releaseYear: row.answerReleaseYear,
      title: row.answerTitle,
    },
    imageUrl: resolveQuizImageUrl(row.imageObjectKey),
    question: row.question,
  };
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
  const enabledMediaTypeCodes = new Set(await getEnabledMediaTypeCodes(authorId));
  const joined = await db.transaction(async (tx) => {
    const currentTime = now ?? sql`now()`;
    const [active] = await tx.select({ id: quizzes.id, attemptLimit: quizzes.attemptLimit }).from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1).for("update");
    if (!active) return "missing" as const;
    const allowedTypes = await tx
      .select({ mediaType: quizMediaTypes.mediaType })
      .from(quizMediaTypes)
      .where(eq(quizMediaTypes.quizId, active.id));
    if (allowedTypes.length === 0 || allowedTypes.some(({ mediaType }) => !enabledMediaTypeCodes.has(mediaType))) {
      return "ineligible" as const;
    }
    await tx.insert(quizParticipants).values({ quizId: active.id, authorId, attemptsRemaining: active.attemptLimit }).onConflictDoNothing();
    return "joined" as const;
  });
  if (joined !== "joined") return { kind: joined };
  return { kind: "joined" as const, participant: await getActiveQuizParticipantState(authorId, now) };
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
    return { kind: "result" as const, correct, comment: correct ? quiz.comment : null, participant: mapParticipantState({ ...updated!, attemptLimit: quiz.attemptLimit }) };
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
