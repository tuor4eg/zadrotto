import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { achievementLevels, achievements, authors, userAchievements } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import type { DomainEventType } from "@/lib/domain-events/catalog";
import { achievementMechanicRegistry } from "./catalog";

type EvaluateAchievementsInput = {
  achievementIds?: readonly number[];
  authorIds: readonly number[];
  awardGroupId: string;
  eventType?: DomainEventType;
  sourceEventId?: string | null;
};

export async function getAchievementProgressValues(
  tx: DbTransaction,
  input: { achievementIds: readonly number[]; authorIds: readonly number[] },
) {
  const achievementIds = [...new Set(input.achievementIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const authorIds = [...new Set(input.authorIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (achievementIds.length === 0 || authorIds.length === 0) return [];
  const configurations = await tx.select({
    achievementId: achievements.id,
    mechanic: achievements.mechanic,
    params: achievements.params,
  }).from(achievements).where(inArray(achievements.id, achievementIds));
  const progress = [];
  const knownMechanics = new Set<string>(achievementMechanicRegistry.map((mechanic) => mechanic.code));
  for (const configuration of configurations) {
    if (!knownMechanics.has(configuration.mechanic)) {
      console.error(`Неизвестная механика ачивки ${configuration.achievementId}: ${configuration.mechanic}.`);
    }
  }
  for (const mechanic of achievementMechanicRegistry) {
    const instances = configurations.filter((item) => item.mechanic === mechanic.code).flatMap((item) => {
      try {
        return [{ achievementId: item.achievementId, params: mechanic.parseParams(item.params) }];
      } catch (error) {
        console.error(`Некорректная конфигурация ачивки ${item.achievementId}.`, error);
        return [];
      }
    });
    if (instances.length > 0) progress.push(...await mechanic.evaluateBatch({ tx, authorIds, instances }));
  }
  return progress;
}

export async function evaluateAchievements(tx: DbTransaction, input: EvaluateAchievementsInput) {
  const authorIds = [...new Set(input.authorIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const achievementIds = input.achievementIds
    ? [...new Set(input.achievementIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
    : undefined;
  if (authorIds.length === 0 || achievementIds?.length === 0) return [];

  const [configurations, eligibleAuthors] = await Promise.all([
    tx.select({
      achievementId: achievements.id,
      levelId: achievementLevels.id,
      mechanic: achievements.mechanic,
      params: achievements.params,
      threshold: achievementLevels.threshold,
    }).from(achievements)
      .innerJoin(achievementLevels, eq(achievementLevels.achievementId, achievements.id))
      .where(and(eq(achievements.enabled, true), achievementIds ? inArray(achievements.id, achievementIds) : undefined))
      .for("share", { of: achievements }),
    tx.select({ id: authors.id }).from(authors).where(and(
      inArray(authors.id, authorIds), eq(authors.isSystem, false), isNull(authors.blockedAt),
    )),
  ]);
  const eligibleAuthorIds = eligibleAuthors.map((author) => author.id);
  if (configurations.length === 0 || eligibleAuthorIds.length === 0) return [];

  const progress = [];
  const knownMechanics = new Set<string>(achievementMechanicRegistry.map((mechanic) => mechanic.code));
  for (const configuration of configurations) {
    if (!knownMechanics.has(configuration.mechanic)) {
      console.error(`Неизвестная механика ачивки ${configuration.achievementId}: ${configuration.mechanic}.`);
    }
  }
  for (const mechanic of achievementMechanicRegistry) {
    if (input.eventType && !mechanic.eventTypes.includes(input.eventType)) continue;
    const instances = new Map<number, unknown>();
    for (const configuration of configurations) {
      if (configuration.mechanic !== mechanic.code || instances.has(configuration.achievementId)) continue;
      try {
        instances.set(configuration.achievementId, mechanic.parseParams(configuration.params));
      } catch (error) {
        console.error(`Некорректная конфигурация ачивки ${configuration.achievementId}.`, error);
      }
    }
    if (instances.size === 0) continue;
    progress.push(...await mechanic.evaluateBatch({
      tx, authorIds: eligibleAuthorIds,
      instances: [...instances].map(([achievementId, params]) => ({ achievementId, params })),
    }));
  }

  const valueByAchievementAuthor = new Map(progress.map((item) => [`${item.achievementId}:${item.authorId}`, item.value]));
  const awards = configurations.flatMap((configuration) => eligibleAuthorIds.flatMap((authorId) => {
    const value = valueByAchievementAuthor.get(`${configuration.achievementId}:${authorId}`) ?? 0;
    return value >= configuration.threshold ? [{
      achievementLevelId: configuration.levelId,
      authorId,
      awardGroupId: input.awardGroupId,
      sourceEventId: input.sourceEventId ?? null,
    }] : [];
  }));
  if (awards.length === 0) return [];

  return tx.insert(userAchievements).values(awards).onConflictDoNothing({
    target: [userAchievements.authorId, userAchievements.achievementLevelId],
  }).returning({ achievementLevelId: userAchievements.achievementLevelId, authorId: userAchievements.authorId });
}
