import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { runInDomainEventTransaction } from "@/db/transaction";
import { authors, mediaItems, mediaTypes, quizMediaTypes, quizParticipants, quizzes } from "@/db/schema";
import { containsNormalizedSearchSql } from "@/db/search";
import { mediaItemSearchCondition } from "@/db/queries/media-item-search";
import { mediaItemDisplayAliasesSql } from "@/db/queries/media-item-display-titles";
import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getAuthorMediaStatus } from "@/db/queries/author-media-statuses";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveQuizImageUrl } from "@/lib/quizzes/images";
import { resolveCoverUrl } from "@/lib/services/minio";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE, calculateUsedQuizAttempts, getAdminQuizParticipantStatus } from "@/lib/quizzes/admin-analytics";
import { calculateQuizPoints, calculateAuthorQuizStatistics, getQuizState, isQuizMediaTypeAllowed, type ActiveQuiz, type QuizParticipantOutcome, type QuizParticipantState } from "@/lib/quizzes/model";

import { transitionMosaic, type MosaicState } from "@/lib/quizzes/mosaic";
import { QUIZ_MECHANICS, type QuizType } from "@/lib/quizzes/mechanics";

export type QuizWriteInput = { type?: "classic" | "mosaic"; configVersion?: number; config?: { seed: number } | null; question: string | null; comment: string | null; imageObjectKey: string | null; answerMediaItemId: number; mediaTypes: string[]; startsAt: Date; endsAt: Date; attemptLimit: number; enabled: boolean };

async function mediaTypesForQuizIds(ids: number[]) {
  if (!ids.length) return new Map<number, string[]>();
  const rows = await db.select().from(quizMediaTypes).where(inArray(quizMediaTypes.quizId, ids));
  const result = new Map<number, string[]>();
  for (const row of rows) result.set(row.quizId, [...(result.get(row.quizId) ?? []), row.mediaType]);
  return result;
}
async function mediaTypeOptionsForQuiz(quizId: number) {
  return db.select({ code: mediaTypes.code, name: mediaTypes.name }).from(quizMediaTypes)
    .innerJoin(mediaTypes, eq(mediaTypes.code, quizMediaTypes.mediaType))
    .where(eq(quizMediaTypes.quizId, quizId)).orderBy(asc(mediaTypes.name));
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
export type AdminQuizStateFilter = "scheduled" | "active" | "finished" | "disabled";
export type AdminQuizCorrectFilter = "yes" | "no";
export const ADMIN_QUIZZES_PAGE_SIZE = 25;

export async function getAdminQuizzes(input: {
  page?: number;
  searchQuery?: string;
  state?: AdminQuizStateFilter;
  hasCorrect?: AdminQuizCorrectFilter;
  type?: QuizType;
} = {}) {
  const now = new Date();
  const searchQuery = input.searchQuery?.trim() ?? "";
  const filters: SQL[] = [];
  if (input.type) filters.push(eq(quizzes.type, input.type));
  if (searchQuery) filters.push(or(
    containsNormalizedSearchSql(quizzes.question, searchQuery),
    mediaItemSearchCondition(searchQuery),
  )!);
  if (input.state === "disabled") filters.push(eq(quizzes.enabled, false));
  if (input.state === "scheduled") filters.push(and(eq(quizzes.enabled, true), gt(quizzes.startsAt, now))!);
  if (input.state === "active") filters.push(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, now), gt(quizzes.endsAt, now))!);
  if (input.state === "finished") filters.push(and(eq(quizzes.enabled, true), lte(quizzes.endsAt, now))!);
  if (input.hasCorrect === "yes") filters.push(sql`exists (select 1 from quiz_participants qp where qp.quiz_id = ${quizzes.id} and qp.outcome = 'correct')`);
  if (input.hasCorrect === "no") filters.push(sql`not exists (select 1 from quiz_participants qp where qp.quiz_id = ${quizzes.id} and qp.outcome = 'correct')`);
  const where = filters.length ? and(...filters) : undefined;
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(quizzes)
    .innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId))
    .where(where);
  const totalPages = getTotalPages(totalCount, ADMIN_QUIZZES_PAGE_SIZE);
  const page = clampPage(input.page ?? 1, totalPages);
  const rows = await db
    .select({
      quiz: quizzes,
      answerTitle: mediaItems.title,
      answerMediaType: mediaItems.mediaType,
      hasEarlierAnswer: sql<boolean>`exists (
        select 1 from quizzes earlier
        where earlier.answer_media_item_id = ${quizzes.answerMediaItemId}
          and (earlier.starts_at < ${quizzes.startsAt} or (earlier.starts_at = ${quizzes.startsAt} and earlier.id < ${quizzes.id}))
      )`,
      correctCount: sql<number>`(
        select count(*)::int from quiz_participants qp
        where qp.quiz_id = ${quizzes.id} and qp.outcome = 'correct'
      )`,
    })
    .from(quizzes)
    .innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId))
    .where(where)
    .orderBy(desc(quizzes.startsAt), desc(quizzes.id))
    .limit(ADMIN_QUIZZES_PAGE_SIZE)
    .offset(getOffset(page, ADMIN_QUIZZES_PAGE_SIZE));
  const ids = rows.map(({ quiz }) => quiz.id); const [types, participantIds, answeredIds] = await Promise.all([mediaTypesForQuizIds(ids), participantQuizIds(ids), answeredQuizIds(ids)]);
  return {
    items: rows.map(({ quiz, ...rest }) => ({ ...quiz, ...rest, mediaTypes: types.get(quiz.id) ?? [], hasAnswers: answeredIds.has(quiz.id), hasParticipants: participantIds.has(quiz.id), imageUrl: quiz.type === "mosaic" ? `/api/quizzes/${quiz.id}/image` : resolveQuizImageUrl(quiz.imageObjectKey), state: getQuizState(quiz, now) })),
    page,
    pageSize: ADMIN_QUIZZES_PAGE_SIZE,
    totalCount,
    totalPages,
  };
}
export async function getAdminQuizById(id: number) {
  const [row] = await db.select({ quiz: quizzes, answerTitle: mediaItems.title, answerMediaType: mediaItems.mediaType }).from(quizzes).innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId)).where(eq(quizzes.id, id)).limit(1);
  if (!row) return null;
  const [types, participantIds, answeredIds] = await Promise.all([mediaTypesForQuizIds([id]), participantQuizIds([id]), answeredQuizIds([id])]);
  return { ...row.quiz, answerTitle: row.answerTitle, answerMediaType: row.answerMediaType, mediaTypes: types.get(id) ?? [], hasAnswers: answeredIds.has(id), hasParticipants: participantIds.has(id), imageUrl: row.quiz.type === "mosaic" ? `/api/quizzes/${id}/image` : resolveQuizImageUrl(row.quiz.imageObjectKey) };
}

export async function getAdminQuizContext(quizId: number) {
  const [row] = await db
    .select({
      type: quizzes.type,
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
    imageUrl: row.type === "mosaic" ? `/api/quizzes/${quizId}/image` : resolveQuizImageUrl(imageObjectKey),
    state: getQuizState(row),
  };
}

export async function getAdminQuizAggregates(quizId: number) {
  const [row] = await db
    .select({
      averagePoints: sql<number | null>`avg(coalesce(${quizParticipants.awardedPoints}, 0))::float`,
      averageCorrectAnswerSeconds: sql<number | null>`(
        avg(extract(epoch from (${quizParticipants.completedAt} - ${quizzes.startsAt})))
        filter (where ${quizParticipants.outcome} = 'correct')
      )::float`,
      correctCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} = 'correct')::int`,
      exhaustedCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} = 'exhausted')::int`,
      inProgressCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} is null)::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(quizParticipants)
    .innerJoin(quizzes, eq(quizzes.id, quizParticipants.quizId))
    .where(eq(quizParticipants.quizId, quizId));

  return row ?? {
    averagePoints: null,
    averageCorrectAnswerSeconds: null,
    correctCount: 0,
    exhaustedCount: 0,
    inProgressCount: 0,
    totalCount: 0,
  };
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
      type: quizzes.type,
      mechanicState: quizParticipants.mechanicState,
      attemptLimit: quizzes.attemptLimit,
      attemptsRemaining: quizParticipants.attemptsRemaining,
      awardedPoints: quizParticipants.awardedPoints,
      completedAt: quizParticipants.completedAt,
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
        when ${quizParticipants.outcome} = 'correct' then 1
        when ${quizParticipants.outcome} = 'exhausted' then 2
        else 3
      end`,
      desc(sql`coalesce(${quizParticipants.awardedPoints}, 0)`),
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
        points: calculateQuizPoints(participantState),
        status: getAdminQuizParticipantStatus(participantState),
        usedAttempts: row.type === "mosaic" ? row.mechanicState?.wrongAnswers ?? 0 : calculateUsedQuizAttempts(participantState),
        openedCells: row.type === "mosaic" ? (row.mechanicState?.openedMask ?? 0).toString(2).replaceAll("0", "").length : 0,
      };
    }),
    page,
    pageSize: ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE,
    totalCount: input.totalCount,
    totalPages,
  };
}
async function assertInput(executor: Pick<typeof db, "select">, input: QuizWriteInput) {
  if (!QUIZ_MECHANICS[input.type ?? "classic"].validateConfig(input.config)) throw new Error("invalid-quiz");
  if ((input.type ?? "classic") === "mosaic" && (!input.imageObjectKey || !input.config || !Number.isInteger(input.config.seed) || input.config.seed < 0 || input.config.seed > 4294967295)) throw new Error("invalid-quiz");
  if ((input.type ?? "classic") === "classic" && input.config != null) throw new Error("invalid-quiz");
  if (input.configVersion !== undefined && input.configVersion !== 1) throw new Error("invalid-quiz");
  if ((!input.question?.trim() && !input.imageObjectKey) || input.mediaTypes.length === 0 || (input.comment?.length ?? 0) > 2000 || input.startsAt >= input.endsAt || !Number.isSafeInteger(input.attemptLimit) || input.attemptLimit < 1 || input.attemptLimit > 10) throw new Error("invalid-quiz");
  const [answer] = await executor.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, input.answerMediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
  if (!answer || !isQuizMediaTypeAllowed(input.mediaTypes, answer.mediaType)) throw new Error("invalid-answer");
}
export async function createQuiz(input: QuizWriteInput) {
  return db.transaction(async (tx) => { await assertInput(tx, input); const [row] = await tx.insert(quizzes).values({ type: input.type ?? "classic", configVersion: 1, config: input.config ?? null, publishedAt: input.type === "mosaic" && input.enabled ? new Date() : null, question: input.question, comment: input.comment, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, attemptLimit: input.attemptLimit, enabled: input.enabled }).returning(); if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: row!.id, mediaType }))); return row!; });
}
export async function updateQuiz(id: number, input: QuizWriteInput) {
  return db.transaction(async (tx) => {
    await assertInput(tx, input);
    const [current] = await tx.select().from(quizzes).where(eq(quizzes.id, id)).limit(1).for("update");
    if (!current) return null;
    const currentMediaTypes = await tx.select({ mediaType: quizMediaTypes.mediaType }).from(quizMediaTypes).where(eq(quizMediaTypes.quizId, id));
    const mediaTypesChanged = currentMediaTypes.length !== input.mediaTypes.length
      || currentMediaTypes.some(({ mediaType }) => !input.mediaTypes.includes(mediaType));
    if (current.type === "mosaic" && current.publishedAt && (current.type !== (input.type ?? "classic") || current.answerMediaItemId !== input.answerMediaItemId || mediaTypesChanged || JSON.stringify(current.config) !== JSON.stringify(input.config ?? null) || current.imageObjectKey !== input.imageObjectKey)) throw new Error("answer-configuration-locked");
    if (current.type !== (input.type ?? "classic")) {
      const [participant] = await tx.select({ authorId: quizParticipants.authorId }).from(quizParticipants).where(eq(quizParticipants.quizId, id)).limit(1);
      if (participant) throw new Error("answer-configuration-locked");
    }
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
    const [row] = await tx.update(quizzes).set({ type: input.type ?? "classic", configVersion: 1, config: input.config ?? null, publishedAt: (input.type ?? "classic") === "mosaic" ? current.publishedAt ?? (input.enabled ? new Date() : null) : null, question: input.question, comment: input.comment, imageObjectKey: input.imageObjectKey, answerMediaItemId: input.answerMediaItemId, startsAt: input.startsAt, endsAt: input.endsAt, attemptLimit: input.attemptLimit, enabled: input.enabled, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning();
    await tx.delete(quizMediaTypes).where(eq(quizMediaTypes.quizId, id));
    if (input.mediaTypes.length > 0) await tx.insert(quizMediaTypes).values(input.mediaTypes.map((mediaType) => ({ quizId: id, mediaType })));
    return row!;
  });
}
export async function deleteQuiz(id: number) { const [row] = await db.delete(quizzes).where(eq(quizzes.id, id)).returning(); return row ?? null; }
export async function setQuizEnabled(id: number, enabled: boolean) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(quizzes).where(eq(quizzes.id, id)).limit(1).for("update");
    if (!current) return null;
    const [row] = await tx.update(quizzes).set({ enabled, publishedAt: current.type === "mosaic" ? current.publishedAt ?? (enabled ? new Date() : null) : null, updatedAt: new Date() }).where(eq(quizzes.id, id)).returning();
    return row ?? null;
  });
}
export async function getActiveQuiz(now?: Date): Promise<ActiveQuiz | null> {
  const currentTime = now ?? sql`now()`;
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1);
  if (!quiz) return null;
  const types = await mediaTypeOptionsForQuiz(quiz.id);
  return {
    id: quiz.id,
    type: quiz.type,
    configVersion: quiz.configVersion,
    config: null,
    question: quiz.question,
    imageUrl: quiz.type === "mosaic" ? null : resolveQuizImageUrl(quiz.imageObjectKey),
    mediaTypes: types.map(({ code }) => code),
    mediaTypeOptions: types,
    startsAt: quiz.startsAt.toISOString(),
    endsAt: quiz.endsAt.toISOString(),
    attemptLimit: quiz.attemptLimit,
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
  return (await getQuizById(active.id, authorId))?.quiz ?? null;
}
export async function joinActiveQuiz(authorId: number, now?: Date) {
  const enabledMediaTypeCodes = new Set(await getEnabledMediaTypeCodes(authorId));
  const joined = await db.transaction(async (tx) => {
    const currentTime = now ?? sql`now()`;
    const [active] = await tx.select({ id: quizzes.id, type: quizzes.type, attemptLimit: quizzes.attemptLimit }).from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1).for("update");
    if (!active) return "missing" as const;
    const allowedTypes = await tx
      .select({ mediaType: quizMediaTypes.mediaType })
      .from(quizMediaTypes)
      .where(eq(quizMediaTypes.quizId, active.id));
    if (allowedTypes.length === 0 || allowedTypes.some(({ mediaType }) => !enabledMediaTypeCodes.has(mediaType))) {
      return "ineligible" as const;
    }
    await tx.insert(quizParticipants).values({ quizId: active.id, authorId, attemptsRemaining: active.attemptLimit, mechanicState: QUIZ_MECHANICS[active.type].createState(active.attemptLimit) }).onConflictDoNothing();
    return "joined" as const;
  });
  if (joined !== "joined") return { kind: joined };
  return { kind: "joined" as const, participant: await getActiveQuizParticipantState(authorId, now) };
}

/** Administrative test reset; the participant row owns all attempts and mechanic state. */
export async function resetQuizParticipant(quizId: number, authorId: number) {
  return db.transaction(async (tx) => {
    // Same lock order as joining/answering, including mosaic's shared quiz lock.
    const [quiz] = await tx.select({ id: quizzes.id }).from(quizzes)
      .where(eq(quizzes.id, quizId)).limit(1).for("update");
    if (!quiz) return false;
    const deleted = await tx.delete(quizParticipants)
      .where(and(eq(quizParticipants.quizId, quizId), eq(quizParticipants.authorId, authorId)))
      .returning({ authorId: quizParticipants.authorId });
    return deleted.length > 0;
  });
}

function mapParticipantState(row: { quizId: number; attemptLimit: number; attemptsRemaining: number; outcome: string | null; type?: "classic" | "mosaic"; mechanicState?: MosaicState | null; revision?: number; awardedPoints?: number | null }): QuizParticipantState {
  return { type: row.type ?? "classic", mosaic: row.mechanicState ?? null, revision: row.revision ?? 0, awardedPoints: row.awardedPoints ?? null, quizId: row.quizId, attemptLimit: row.attemptLimit, attemptsRemaining: row.attemptsRemaining, completed: row.outcome !== null, outcome: row.outcome as QuizParticipantState["outcome"], points: calculateQuizPoints({ ...row, outcome: row.outcome as QuizParticipantOutcome | null }) };
}

export async function getActiveQuizParticipantState(authorId: number, now?: Date): Promise<QuizParticipantState | null> {
  const currentTime = now ?? sql`now()`;
  const [row] = await db.select({ type: quizzes.type, mechanicState: quizParticipants.mechanicState, revision: quizParticipants.revision, awardedPoints: quizParticipants.awardedPoints, quizId: quizzes.id, attemptLimit: quizzes.attemptLimit, attemptsRemaining: quizParticipants.attemptsRemaining, outcome: quizParticipants.outcome }).from(quizzes).innerJoin(quizParticipants, and(eq(quizParticipants.quizId, quizzes.id), eq(quizParticipants.authorId, authorId))).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1);
  return row ? mapParticipantState(row) : null;
}
export async function getAuthorQuizStatistics(authorId: number) {
  const rows = await db.select({ type: quizzes.type, mechanicState: quizParticipants.mechanicState, awardedPoints: quizParticipants.awardedPoints, outcome: quizParticipants.outcome, attemptsRemaining: quizParticipants.attemptsRemaining, attemptLimit: quizzes.attemptLimit, durationSeconds: sql<number>`extract(epoch from (${quizParticipants.completedAt} - ${quizzes.startsAt}))::float` }).from(quizParticipants).innerJoin(quizzes, eq(quizzes.id, quizParticipants.quizId)).where(and(eq(quizParticipants.authorId, authorId), isNotNull(quizParticipants.completedAt), isNotNull(quizParticipants.outcome))).orderBy(asc(quizParticipants.completedAt), asc(quizParticipants.quizId));
  return calculateAuthorQuizStatistics(rows.map((row) => ({ ...row, wrongAnswers: row.mechanicState?.wrongAnswers, outcome: row.outcome as QuizParticipantOutcome })));
}
export async function getQuizLeaderboard(limit = 5) {
  return db
    .select({
      authorAvatarObjectKey: authors.avatarObjectKey,
      authorId: authors.id,
      authorName: authors.name,
      totalPoints: sql<number>`sum(coalesce(${quizParticipants.awardedPoints}, 0))::int`,
      totalTimeSeconds: sql<number>`sum(extract(epoch from (${quizParticipants.completedAt} - ${quizzes.startsAt}))) filter (where ${quizParticipants.outcome} = 'correct')::float`,
    })
    .from(quizParticipants)
    .innerJoin(authors, eq(authors.id, quizParticipants.authorId))
    .innerJoin(quizzes, eq(quizzes.id, quizParticipants.quizId))
    .where(and(isNotNull(quizParticipants.completedAt), isNotNull(quizParticipants.outcome)))
    .groupBy(authors.id, authors.name, authors.avatarObjectKey)
    .having(sql`sum(coalesce(${quizParticipants.awardedPoints}, 0)) > 0`)
    .orderBy(
      desc(sql`sum(coalesce(${quizParticipants.awardedPoints}, 0))`),
      asc(sql`sum(extract(epoch from (${quizParticipants.completedAt} - ${quizzes.startsAt}))) filter (where ${quizParticipants.outcome} = 'correct')`),
      asc(authors.name),
      asc(authors.id),
    )
    .limit(limit);
}
export const QUIZ_ARCHIVE_PAGE_SIZE = 25;

export async function getRevealedQuizAnswer(quizId: number, authorId: number) {
  const [row] = await db.select({
    id: mediaItems.id,
    code: mediaItems.code,
    title: mediaItems.title,
    coverUrl: mediaItems.coverUrl,
    quizType: quizzes.type,
    quizId: quizzes.id,
    comment: quizzes.comment,
  }).from(quizzes)
    .innerJoin(mediaItems, eq(mediaItems.id, quizzes.answerMediaItemId))
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(quizParticipants, and(eq(quizParticipants.quizId, quizzes.id), eq(quizParticipants.authorId, authorId)))
    .where(and(
      eq(quizzes.id, quizId), eq(quizzes.enabled, true), lte(quizzes.startsAt, sql`now()`),
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true),
      or(lte(quizzes.endsAt, sql`now()`), eq(quizParticipants.outcome, "correct"), and(eq(quizzes.type, "mosaic"), eq(quizParticipants.outcome, "exhausted"))),
    )).limit(1);
  return row ? { ...row, coverUrl: row.quizType === "mosaic" ? `/api/quizzes/${row.quizId}/image` : resolveCoverUrl(row.coverUrl) } : null;
}

export async function getQuizById(id: number, authorId: number) {
  const [row] = await db
    .select({
      id: quizzes.id,
      type: quizzes.type,
      configVersion: quizzes.configVersion,
      config: quizzes.config,
      question: quizzes.question,
      imageObjectKey: quizzes.imageObjectKey,
      startsAt: quizzes.startsAt,
      endsAt: quizzes.endsAt,
      attemptLimit: quizzes.attemptLimit,
    })
    .from(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.enabled, true), lte(quizzes.startsAt, sql`now()`)))
    .limit(1);
  if (!row) return null;

  const [types, [participantRow]] = await Promise.all([
    mediaTypeOptionsForQuiz(id),
    db.select({
      mechanicState: quizParticipants.mechanicState,
      revision: quizParticipants.revision,
      awardedPoints: quizParticipants.awardedPoints,
      quizId: quizParticipants.quizId,
      attemptsRemaining: quizParticipants.attemptsRemaining,
      outcome: quizParticipants.outcome,
    }).from(quizParticipants)
      .where(and(eq(quizParticipants.quizId, id), eq(quizParticipants.authorId, authorId)))
      .limit(1),
  ]);
  const quiz: ActiveQuiz = {
    id: row.id,
    ...(row.type === "mosaic" ? { type: "mosaic" as const, configVersion: row.configVersion, config: participantRow ? row.config : null } : { type: "classic" as const, configVersion: row.configVersion, config: null }),
    question: row.question,
    imageUrl: row.type === "mosaic" ? (participantRow || row.endsAt.getTime() <= Date.now() ? `/api/quizzes/${row.id}/image` : null) : resolveQuizImageUrl(row.imageObjectKey),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    attemptLimit: row.attemptLimit,
    mediaTypes: types.map(({ code }) => code),
    mediaTypeOptions: types,
  };
  return {
    quiz,
    finished: row.endsAt.getTime() <= Date.now(),
    participant: participantRow ? mapParticipantState({ ...participantRow, type: row.type, attemptLimit: row.attemptLimit }) : null,
  };
}

export async function getQuizArchivePage(requestedPage = 1) {
  const now = new Date();
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(quizzes)
    .where(and(eq(quizzes.enabled, true), lte(quizzes.endsAt, now)));
  const totalPages = getTotalPages(totalCount, QUIZ_ARCHIVE_PAGE_SIZE);
  const page = clampPage(requestedPage, totalPages);
  const items = await getQuizArchive(QUIZ_ARCHIVE_PAGE_SIZE, now, getOffset(page, QUIZ_ARCHIVE_PAGE_SIZE));

  return { items, page, pageSize: QUIZ_ARCHIVE_PAGE_SIZE, totalCount, totalPages };
}

export async function getAdjacentQuizzes(endsAt: Date, id: number) {
  const visible = and(eq(quizzes.enabled, true), lte(quizzes.startsAt, sql`now()`));
  const [previous, next] = await Promise.all([
    db.select({ id: quizzes.id }).from(quizzes)
      .where(and(visible, or(lt(quizzes.endsAt, endsAt), and(eq(quizzes.endsAt, endsAt), lt(quizzes.id, id)))))
      .orderBy(desc(quizzes.endsAt), desc(quizzes.id)).limit(1),
    db.select({ id: quizzes.id }).from(quizzes)
      .where(and(visible, or(gt(quizzes.endsAt, endsAt), and(eq(quizzes.endsAt, endsAt), gt(quizzes.id, id)))))
      .orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1),
  ]);
  return { previousId: previous[0]?.id ?? null, nextId: next[0]?.id ?? null };
}

export async function getQuizArchive(limit = 5, now?: Date, offset = 0) {
  const currentTime = now ?? sql`now()`;
  const quizRows = await db
    .select({
      type: quizzes.type,
      endsAt: quizzes.endsAt,
      id: quizzes.id,
      imageObjectKey: quizzes.imageObjectKey,
      question: quizzes.question,
    })
    .from(quizzes)
    .where(and(eq(quizzes.enabled, true), lte(quizzes.endsAt, currentTime)))
    .orderBy(desc(quizzes.endsAt), desc(quizzes.id))
    .limit(limit)
    .offset(offset);

  const quizIds = quizRows.map(({ id }) => id);
  if (quizIds.length === 0) return [];

  const [participantRows, mediaTypeRows] = await Promise.all([
    db
      .select({
        participantCount: sql<number>`count(*)::int`,
        quizId: quizParticipants.quizId,
        correctCount: sql<number>`count(*) filter (where ${quizParticipants.outcome} = 'correct')::int`,
      })
      .from(quizParticipants)
      .innerJoin(authors, eq(authors.id, quizParticipants.authorId))
      .where(inArray(quizParticipants.quizId, quizIds))
      .groupBy(quizParticipants.quizId),
    db
      .select({
        code: quizMediaTypes.mediaType,
        name: mediaTypes.name,
        quizId: quizMediaTypes.quizId,
      })
      .from(quizMediaTypes)
      .innerJoin(mediaTypes, eq(mediaTypes.code, quizMediaTypes.mediaType))
      .where(inArray(quizMediaTypes.quizId, quizIds))
      .orderBy(asc(mediaTypes.name)),
  ]);

  const participantsByQuizId = new Map(participantRows.map((row) => [row.quizId, row]));
  const mediaTypesByQuizId = new Map<number, { code: string; name: string }[]>();
  for (const row of mediaTypeRows) {
    const items = mediaTypesByQuizId.get(row.quizId) ?? [];
    items.push({ code: row.code, name: row.name });
    mediaTypesByQuizId.set(row.quizId, items);
  }

  return quizRows.map(({ imageObjectKey, ...quiz }) => ({
    ...quiz,
    imageUrl: quiz.type === "mosaic" ? null : resolveQuizImageUrl(imageObjectKey),
    mediaTypes: mediaTypesByQuizId.get(quiz.id) ?? [],
    participantCount: participantsByQuizId.get(quiz.id)?.participantCount ?? 0,
    correctCount: participantsByQuizId.get(quiz.id)?.correctCount ?? 0,
  }));
}
export async function checkQuizGuess(titleId: number, authorId: number, now?: Date, expectedQuizId?: number) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const currentTime = now ?? sql`now()`;
    const [quiz] = await tx.select().from(quizzes).where(and(eq(quizzes.enabled, true), lte(quizzes.startsAt, currentTime), gt(quizzes.endsAt, currentTime))).orderBy(asc(quizzes.endsAt), asc(quizzes.id)).limit(1).for("update");
    if (!quiz || quiz.type !== "classic" || (expectedQuizId !== undefined && quiz.id !== expectedQuizId)) return { kind: "missing" as const };
    const [participant] = await tx.select().from(quizParticipants).where(and(eq(quizParticipants.quizId, quiz.id), eq(quizParticipants.authorId, authorId))).limit(1).for("update");
    if (!participant) return { kind: "not-participant" as const };
    if (participant.outcome) return { kind: "completed" as const, participant: mapParticipantState({ ...participant, attemptLimit: quiz.attemptLimit }) };
    const [title] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, titleId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
    if (!title) return { kind: "title-missing" as const }; const types = await tx.select({ mediaType: quizMediaTypes.mediaType }).from(quizMediaTypes).where(eq(quizMediaTypes.quizId, quiz.id)); if (!isQuizMediaTypeAllowed(types.map((item) => item.mediaType), title.mediaType)) return { kind: "invalid-type" as const };
    const correct = quiz.answerMediaItemId === titleId;
    const attemptsRemaining = correct ? participant.attemptsRemaining : participant.attemptsRemaining - 1;
    const outcome = correct ? "correct" as const : attemptsRemaining === 0 ? "exhausted" as const : null;
    const [updated] = await tx.update(quizParticipants).set({ attemptsRemaining, awardedPoints: outcome ? (correct ? attemptsRemaining : 0) : null, outcome, completedAt: outcome ? new Date() : null }).where(and(eq(quizParticipants.quizId, quiz.id), eq(quizParticipants.authorId, authorId))).returning();
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
  const condition = mediaItemSearchCondition(query);
  const typeCondition = mediaTypeFilter.length > 0
    ? inArray(mediaItems.mediaType, [...mediaTypeFilter])
    : undefined
  const rows = await db
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      aliases: mediaItemDisplayAliasesSql(),
      releaseYear: mediaItems.releaseYear,
      mediaType: mediaItems.mediaType,
      mediaTypeName: mediaTypes.name,
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
  return rows.map(({ aliases, ...item }) => ({
    ...item,
    title: resolveMediaItemDisplayTitles({ ...item, aliases }).displayTitle,
  }));
}

export async function getQuizAnswerEntry(mediaItemId: number, mediaTypeFilter: readonly string[], authorId: number) {
  const [visible] = await db.select({ id: mediaItems.id }).from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      eq(mediaTypes.isPubliclyAvailable, true), mediaTypeFilter.length ? inArray(mediaItems.mediaType, [...mediaTypeFilter]) : undefined)).limit(1);
  if (!visible) return null;
  const [items, currentAuthorStatus] = await Promise.all([
    getMediaItemTilesByIds([visible.id], authorId),
    getAuthorMediaStatus({ authorId, mediaItemId: visible.id }),
  ]);
  return items[0] ? { mediaItemId: visible.id, item: items[0], currentAuthorStatus } : null;
}
export async function isAssignedQuizImageObjectKey(key: string) { const [row] = await db.select({ id: quizzes.id }).from(quizzes).where(and(eq(quizzes.imageObjectKey, key), eq(quizzes.type, "classic"))).limit(1); return Boolean(row); }
export async function isActiveQuizImageObjectKey(key: string) {
  const [row] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(
      eq(quizzes.imageObjectKey, key),
      eq(quizzes.type, "classic"),
      eq(quizzes.enabled, true),
      lte(quizzes.startsAt, sql`now()`),
      gt(quizzes.endsAt, sql`now()`),
    ))
    .limit(1);
  return Boolean(row);
}

export async function getQuizImageObjectKey(quizId: number, authorId: number | null, admin = false) {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (!quiz || quiz.type !== "mosaic" || !quiz.imageObjectKey) return null;
  if (admin) return quiz.imageObjectKey;
  if (!authorId || !quiz.enabled || quiz.startsAt > new Date() || (quiz.endsAt > new Date() && !(await isQuizParticipant(quizId, authorId)))) return null;
  return quiz.imageObjectKey;
}

export async function performMosaicQuizAction(quizId: number, authorId: number, command: import("@/lib/quizzes/mosaic").MosaicCommand) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const [quiz] = await tx.select().from(quizzes).where(and(eq(quizzes.id, quizId), eq(quizzes.type, "mosaic"), eq(quizzes.enabled, true), lte(quizzes.startsAt, sql`now()`), gt(quizzes.endsAt, sql`now()`))).limit(1).for("share");
    if (!quiz) return { kind: "missing" as const };
    const [participant] = await tx.select().from(quizParticipants).where(and(eq(quizParticipants.quizId, quizId), eq(quizParticipants.authorId, authorId))).limit(1).for("update");
    if (!participant) return { kind: "not-participant" as const };
    const publicState = () => mapParticipantState({ ...participant, type: "mosaic", attemptLimit: quiz.attemptLimit });
    const state = participant.mechanicState;
    if (!state) throw new Error("missing-mosaic-state");
    if (state.processedActions.includes(command.actionId)) return { kind: "result" as const, correct: participant.outcome === "correct", participant: publicState() };
    if (participant.revision !== command.revision) return { kind: "conflict" as const, participant: publicState() };
    if (participant.outcome) return { kind: "completed" as const, participant: publicState() };
    let correct = false;
    if (command.type === "submitAnswer") {
      const [title] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType)).where(and(eq(mediaItems.id, command.titleId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), eq(mediaTypes.isPubliclyAvailable, true))).limit(1);
      if (!title) return { kind: "title-missing" as const };
      const types = await tx.select({ mediaType: quizMediaTypes.mediaType }).from(quizMediaTypes).where(eq(quizMediaTypes.quizId, quizId));
      if (!isQuizMediaTypeAllowed(types.map((item) => item.mediaType), title.mediaType)) return { kind: "invalid-type" as const };
      correct = quiz.answerMediaItemId === command.titleId;
    }
    const transition = transitionMosaic(state, command.type === "openCell" ? command : { type: "submitAnswer", correct });
    if (!transition.changed) return { kind: "result" as const, correct, participant: publicState() };
    const mechanicState = { ...transition.state, processedActions: [...state.processedActions, command.actionId].slice(-20) };
    const outcome = transition.outcome;
    const [updated] = await tx.update(quizParticipants).set({ mechanicState, revision: participant.revision + 1, attemptsRemaining: mechanicState.remainingPoints, outcome, awardedPoints: outcome ? (outcome === "correct" ? mechanicState.remainingPoints : 0) : null, completedAt: outcome ? new Date() : null }).where(and(eq(quizParticipants.quizId, quizId), eq(quizParticipants.authorId, authorId))).returning();
    if (outcome) await appendEvent({ actorAuthorId: authorId, aggregateId: `${quizId}:${authorId}`, aggregateType: "quiz-participant", payload: { authorId, outcome, quizId }, type: "quiz.completed" });
    return { kind: "result" as const, correct, participant: mapParticipantState({ ...updated!, type: "mosaic", attemptLimit: quiz.attemptLimit }) };
  });
}
