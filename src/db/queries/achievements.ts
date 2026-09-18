import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { getAchievementSettings } from "@/db/queries/achievement-settings";
import { containsNormalizedSearchSql } from "@/db/search";
import { achievementLevels, achievementSettings, achievements, userAchievements } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import {
  countRatingAuthoredForMediaCodes,
  getAchievementMechanic,
  type CountMechanicParams,
} from "@/lib/achievements/catalog";
import { resolveAchievementImageUrl } from "@/lib/achievements/images";
import { isAchievementRarity, type AchievementRarity } from "@/lib/achievements/model";
import { getAchievementProgressValues } from "@/lib/achievements/service";
import { normalizeSearchText } from "@/lib/search/normalize";

const DEMO_RATING_PROGRESS_CODE_LIMIT = 2_000;

type DemoRatingAchievementDefinition = {
  achievementId: number;
  code: string;
  description: string | null;
  levels: Array<{
    description: string | null;
    imageUrl: string | null;
    level: number;
    name: string;
    rarity: AchievementRarity;
    showcaseBackgroundImageUrl: string | null;
    threshold: number;
  }>;
  mechanic: string;
  name: string;
  params: Record<string, unknown>;
};

async function loadDemoRatingAchievementDefinitions(): Promise<DemoRatingAchievementDefinition[]> {
  const rows = await db
    .select({
      achievementId: achievements.id,
      code: achievements.code,
      description: achievements.description,
      level: achievementLevels.level,
      levelDescription: achievementLevels.description,
      levelImageObjectKey: achievementLevels.imageObjectKey,
      levelName: achievementLevels.name,
      mechanic: achievements.mechanic,
      rarity: achievementLevels.rarity,
      showcaseBackgroundImageObjectKey: achievementLevels.showcaseBackgroundImageObjectKey,
      name: achievements.name,
      params: achievements.params,
      threshold: achievementLevels.threshold,
    })
    .from(achievements)
    .innerJoin(achievementLevels, eq(achievementLevels.achievementId, achievements.id))
    .where(and(
      eq(achievements.enabled, true),
      eq(achievements.mechanic, "rating.authored.count"),
    ))
    .orderBy(asc(achievements.displayOrder), asc(achievements.id), asc(achievementLevels.level));

  const byAchievement = new Map<number, typeof rows>();
  for (const row of rows) {
    byAchievement.set(row.achievementId, [...(byAchievement.get(row.achievementId) ?? []), row]);
  }

  return [...byAchievement.values()].map((levels) => ({
    achievementId: levels[0]!.achievementId,
    code: levels[0]!.code,
    description: levels[0]!.description,
    levels: levels.map((level) => ({
      description: level.levelDescription ?? level.description,
      imageUrl: resolveAchievementImageUrl(level.levelImageObjectKey),
      level: level.level,
      name: level.levelName ?? level.name,
      rarity: level.rarity,
      showcaseBackgroundImageUrl: resolveAchievementImageUrl(level.showcaseBackgroundImageObjectKey),
      threshold: level.threshold,
    })),
    mechanic: levels[0]!.mechanic,
    name: levels[0]!.name,
    params: levels[0]!.params ?? {},
  }));
}

function toDemoRatingAchievementCatalogItem(definition: DemoRatingAchievementDefinition) {
  return {
    code: definition.code,
    description: definition.description,
    levels: definition.levels,
    mechanic: definition.mechanic,
    name: definition.name,
    params: definition.params,
  };
}

export async function getDemoRatingAchievementCatalog() {
  const definitions = await loadDemoRatingAchievementDefinitions();
  return definitions.map(toDemoRatingAchievementCatalogItem);
}

export async function getDemoRatingAchievementState(mediaItemCodes: readonly string[]) {
  const [definitions, settings] = await Promise.all([
    loadDemoRatingAchievementDefinitions(),
    getAchievementSettings(),
  ]);
  const achievementsCatalog = definitions.map(toDemoRatingAchievementCatalogItem);
  const values: Record<string, number> = Object.fromEntries(
    definitions.map((definition) => [definition.code, 0]),
  );

  const mechanic = getAchievementMechanic("rating.authored.count");
  if (!mechanic || definitions.length === 0) {
    return {
      achievements: achievementsCatalog,
      defaultShowcaseBackgroundImageUrl: settings.defaultShowcaseBackgroundImageUrl,
      values,
    };
  }

  const instances = new Map<number, CountMechanicParams>();
  for (const definition of definitions) {
    try {
      instances.set(
        definition.achievementId,
        mechanic.parseParams(definition.params) as CountMechanicParams,
      );
    } catch (error) {
      console.error(`Некорректная конфигурация demo-ачивки ${definition.achievementId}.`, error);
    }
  }

  const uniqueCodes = [...new Set(
    mediaItemCodes.filter((code) => typeof code === "string" && code.trim() !== ""),
  )].slice(0, DEMO_RATING_PROGRESS_CODE_LIMIT);

  if (uniqueCodes.length === 0 || instances.size === 0) {
    return {
      achievements: achievementsCatalog,
      defaultShowcaseBackgroundImageUrl: settings.defaultShowcaseBackgroundImageUrl,
      values,
    };
  }

  const progress = await db.transaction((tx) => countRatingAuthoredForMediaCodes({
    tx,
    mediaItemCodes: uniqueCodes,
    instances: [...instances].map(([achievementId, params]) => ({ achievementId, params })),
  }));

  const valueByAchievementId = new Map(progress.map((item) => [item.achievementId, item.value]));
  for (const definition of definitions) {
    values[definition.code] = valueByAchievementId.get(definition.achievementId) ?? 0;
  }

  return {
    achievements: achievementsCatalog,
    defaultShowcaseBackgroundImageUrl: settings.defaultShowcaseBackgroundImageUrl,
    values,
  };
}

export async function getAchievementShowcase(authorId: number) {
  const [rows, settings] = await Promise.all([
    db
    .select({
      awardedAt: userAchievements.awardedAt,
      achievementId: achievements.id,
      code: achievements.code,
      description: achievements.description,
      level: achievementLevels.level,
      levelDescription: achievementLevels.description,
      levelImageObjectKey: achievementLevels.imageObjectKey,
      levelName: achievementLevels.name,
      mechanic: achievements.mechanic,
      params: achievements.params,
      rarity: achievementLevels.rarity,
      showcaseBackgroundImageObjectKey: achievementLevels.showcaseBackgroundImageObjectKey,
      name: achievements.name,
      threshold: achievementLevels.threshold,
    })
    .from(achievements)
    .innerJoin(achievementLevels, eq(achievementLevels.achievementId, achievements.id))
    .leftJoin(
      userAchievements,
      and(
        eq(userAchievements.achievementLevelId, achievementLevels.id),
        eq(userAchievements.authorId, authorId),
      ),
    )
    .where(or(
      sql`exists (
        select 1 from user_achievements awarded
        inner join achievement_levels awarded_level on awarded_level.id = awarded.achievement_level_id
        where awarded.author_id = ${authorId} and awarded_level.achievement_id = ${achievements.id}
      )`,
      and(eq(achievements.enabled, true), eq(achievements.showWhenLocked, true)),
    ))
    .orderBy(asc(achievements.displayOrder), asc(achievements.id), asc(achievementLevels.level)),
    getAchievementSettings(),
  ]);

  const byAchievement = new Map<number, typeof rows>();
  for (const row of rows) byAchievement.set(row.achievementId, [...(byAchievement.get(row.achievementId) ?? []), row]);
  const progress = await db.transaction((tx) => getAchievementProgressValues(tx, {
    achievementIds: [...byAchievement.keys()],
    authorIds: [authorId],
  }));
  const valueByAchievement = new Map(progress.map((item) => [item.achievementId, item.value]));
  return [...byAchievement.values()].map((levels) => {
    const awarded = levels.filter((item) => item.awardedAt !== null).at(-1) ?? null;
    const presentation = awarded ?? levels[0]!;
    const nextLevel = levels.find((item) => item.awardedAt === null) ?? null;
    const awardedLevels = levels.flatMap((item) => {
      if (item.awardedAt === null) return []
      return [{
        awardedAt: item.awardedAt,
        description: item.levelDescription ?? item.description,
        imageUrl: resolveAchievementImageUrl(item.levelImageObjectKey),
        level: item.level,
        name: item.levelName ?? item.name,
        rarity: item.rarity,
        showcaseBackgroundImageUrl: resolveAchievementImageUrl(item.showcaseBackgroundImageObjectKey),
      }]
    })
    const ownImageUrl = resolveAchievementImageUrl(presentation.levelImageObjectKey)
    return {
      awardedAt: awarded?.awardedAt ?? null,
      awardedLevels,
      awardedThreshold: awarded?.threshold ?? null,
      code: presentation.code,
      currentValue: valueByAchievement.get(presentation.achievementId) ?? 0,
      description: presentation.levelDescription ?? presentation.description,
      highestAwardedLevel: awarded?.level ?? null,
      imageUrl: awarded ? ownImageUrl : settings.lockedImageUrl,
      levelCount: levels.length,
      mechanic: presentation.mechanic,
      name: presentation.levelName ?? presentation.name,
      nextLevel: nextLevel?.level ?? null,
      nextThreshold: nextLevel?.threshold ?? null,
      params: (presentation.params ?? {}) as Record<string, unknown>,
      rarity: presentation.rarity,
      showcaseBackgroundImageUrl: resolveAchievementImageUrl(presentation.showcaseBackgroundImageObjectKey),
    }
  });
}

export async function getLatestAwardedAchievement(authorId: number) {
  const [achievement] = await db
    .select({
      awardedAt: userAchievements.awardedAt,
      imageObjectKey: achievementLevels.imageObjectKey,
      name: sql<string>`coalesce(${achievementLevels.name}, ${achievements.name})`,
    })
    .from(userAchievements)
    .innerJoin(achievementLevels, eq(achievementLevels.id, userAchievements.achievementLevelId))
    .innerJoin(achievements, eq(achievements.id, achievementLevels.achievementId))
    .where(eq(userAchievements.authorId, authorId))
    .orderBy(desc(userAchievements.awardedAt), desc(userAchievements.id))
    .limit(1);

  return achievement
    ? {
        awardedAt: achievement.awardedAt,
        imageUrl: resolveAchievementImageUrl(achievement.imageObjectKey),
        name: achievement.name,
      }
    : null;
}

export type AdminAchievementStatusFilter = "all" | "enabled" | "disabled";
export type AdminAchievementVisibilityFilter = "all" | "regular" | "secret";
export type AdminAchievementAwardFilter = "all" | "awarded" | "unawarded";

export const ADMIN_ACHIEVEMENTS_PAGE_SIZE = 24;

export async function getAdminAchievements(input: {
  awardStatus?: AdminAchievementAwardFilter;
  page?: number;
  searchQuery?: string;
  status?: AdminAchievementStatusFilter;
  visibility?: AdminAchievementVisibilityFilter;
} = {}) {
  const awardStatus = input.awardStatus ?? "all";
  const searchQuery = normalizeSearchText(input.searchQuery ?? "");
  const status = input.status ?? "all";
  const visibility = input.visibility ?? "all";
  const filters = [
    searchQuery ? or(
      containsNormalizedSearchSql(achievements.name, searchQuery),
      containsNormalizedSearchSql(achievements.description, searchQuery),
      containsNormalizedSearchSql(achievements.code, searchQuery),
      containsNormalizedSearchSql(achievements.mechanic, searchQuery),
    ) : undefined,
    status === "enabled" ? eq(achievements.enabled, true) : status === "disabled" ? eq(achievements.enabled, false) : undefined,
    visibility === "regular" ? eq(achievements.showWhenLocked, true) : visibility === "secret" ? eq(achievements.showWhenLocked, false) : undefined,
    awardStatus === "awarded" ? sql`exists (
      select 1 from ${achievementLevels}
      inner join ${userAchievements} on ${userAchievements.achievementLevelId} = ${achievementLevels.id}
      where ${achievementLevels.achievementId} = ${achievements.id}
    )` : awardStatus === "unawarded" ? sql`not exists (
      select 1 from ${achievementLevels}
      inner join ${userAchievements} on ${userAchievements.achievementLevelId} = ${achievementLevels.id}
      where ${achievementLevels.achievementId} = ${achievements.id}
    )` : undefined,
  ].filter((condition) => condition !== undefined);
  const where = filters.length ? and(...filters) : undefined;
  const [{ totalCount }] = await db.select({ totalCount: sql<number>`count(*)::int` })
    .from(achievements)
    .where(where);
  const totalPages = getTotalPages(totalCount, ADMIN_ACHIEVEMENTS_PAGE_SIZE);
  const page = clampPage(input.page ?? 1, totalPages);
  const rows = await db.select().from(achievements)
    .where(where)
    .orderBy(asc(achievements.displayOrder), asc(achievements.id))
    .limit(ADMIN_ACHIEVEMENTS_PAGE_SIZE)
    .offset(getOffset(page, ADMIN_ACHIEVEMENTS_PAGE_SIZE));
  const achievementIds = rows.map((row) => row.id);
  const [awarded, levelImages] = achievementIds.length ? await Promise.all([
    db.select({
      achievementId: achievementLevels.achievementId,
      maxAwardedLevel: sql<number>`max(${achievementLevels.level})::int`,
    })
      .from(userAchievements)
      .innerJoin(achievementLevels, eq(achievementLevels.id, userAchievements.achievementLevelId))
      .where(inArray(achievementLevels.achievementId, achievementIds))
      .groupBy(achievementLevels.achievementId),
    db.select({
      achievementId: achievementLevels.achievementId,
      imageObjectKey: achievementLevels.imageObjectKey,
      level: achievementLevels.level,
    }).from(achievementLevels)
      .where(and(
        inArray(achievementLevels.achievementId, achievementIds),
        isNotNull(achievementLevels.imageObjectKey),
      ))
      .orderBy(asc(achievementLevels.achievementId), desc(achievementLevels.level)),
  ]) : [[], []]
  const maxAwardedLevelByAchievement = new Map(
    awarded.map((item) => [item.achievementId, item.maxAwardedLevel]),
  )
  const firstLevelImageByAchievement = new Map<number, string>()
  const highestLevelImageByAchievement = new Map<number, string>()
  for (const level of levelImages) {
    if (!level.imageObjectKey) continue
    if (level.level === 1) firstLevelImageByAchievement.set(level.achievementId, level.imageObjectKey)
    if (!highestLevelImageByAchievement.has(level.achievementId)) {
      highestLevelImageByAchievement.set(level.achievementId, level.imageObjectKey)
    }
  }
  return {
    items: rows.map((row) => ({
      ...row,
      hasAwards: maxAwardedLevelByAchievement.has(row.id),
      maxAwardedLevel: maxAwardedLevelByAchievement.get(row.id) ?? null,
      imageUrl: resolveAchievementImageUrl(
        firstLevelImageByAchievement.get(row.id) ?? highestLevelImageByAchievement.get(row.id) ?? null,
      ),
    })),
    page,
    pageSize: ADMIN_ACHIEVEMENTS_PAGE_SIZE,
    totalCount,
    totalPages,
  }
}

export async function getAdminAchievementById(id: number) {
  const [row, levels, awarded] = await Promise.all([
    db.select().from(achievements).where(eq(achievements.id, id)).limit(1),
    db.select().from(achievementLevels).where(eq(achievementLevels.achievementId, id)).orderBy(asc(achievementLevels.level)),
    db.select({ levelId: userAchievements.achievementLevelId })
      .from(userAchievements)
      .innerJoin(achievementLevels, eq(achievementLevels.id, userAchievements.achievementLevelId))
      .where(eq(achievementLevels.achievementId, id))
      .groupBy(userAchievements.achievementLevelId),
  ]);
  const achievement = row[0];
  const awardedIds = new Set(awarded.map((item) => item.levelId));
  return achievement ? {
    ...achievement,
    hasAwards: awardedIds.size > 0,
    levels: levels.map((level) => ({
      ...level,
      imageUrl: resolveAchievementImageUrl(level.imageObjectKey),
      isAwarded: awardedIds.has(level.id),
      showcaseBackgroundImageUrl: resolveAchievementImageUrl(level.showcaseBackgroundImageObjectKey),
    })),
  } : null;
}

export async function createAchievementWithFirstLevel(input: {
  code: string;
  description: string | null;
  enabled: boolean;
  firstLevelThreshold: number;
  mechanic: string;
  name: string;
  params: Record<string, unknown>;
  showWhenLocked: boolean;
}) {
  if (!Number.isSafeInteger(input.firstLevelThreshold) || input.firstLevelThreshold < 1) {
    throw new Error("invalid-achievement-levels");
  }
  return db.transaction(async (tx) => {
    const [achievement] = await tx.insert(achievements).values({
      code: input.code,
      description: input.description,
      enabled: input.enabled,
      mechanic: input.mechanic,
      name: input.name,
      params: input.params,
      showWhenLocked: input.showWhenLocked,
    }).returning();
    await tx.insert(achievementLevels).values({
      achievementId: achievement!.id,
      level: 1,
      threshold: input.firstLevelThreshold,
    });
    return achievement!;
  });
}

export async function updateAchievementGeneral(input: {
  description: string | null;
  enabled: boolean;
  id: number;
  mechanic: string;
  name: string;
  params: Record<string, unknown>;
  showWhenLocked: boolean;
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(achievements).where(eq(achievements.id, input.id)).limit(1).for("update");
    if (!current) return null;
    const awarded = await tx.select({ id: userAchievements.id })
      .from(userAchievements)
      .innerJoin(achievementLevels, eq(achievementLevels.id, userAchievements.achievementLevelId))
      .where(eq(achievementLevels.achievementId, input.id))
      .limit(1);
    if (awarded.length > 0 && (current.mechanic !== input.mechanic || JSON.stringify(current.params) !== JSON.stringify(input.params))) {
      throw new Error("achievement-condition-locked");
    }
    const [updated] = await tx.update(achievements).set({
      description: input.description,
      enabled: input.enabled,
      mechanic: input.mechanic,
      name: input.name,
      params: input.params,
      showWhenLocked: input.showWhenLocked,
      updatedAt: new Date(),
    }).where(eq(achievements.id, input.id)).returning();
    return updated ?? null;
  });
}

async function getAwardedLevelIds(tx: DbTransaction, achievementId: number) {
  const awarded = await tx.select({ levelId: userAchievements.achievementLevelId })
    .from(userAchievements)
    .innerJoin(achievementLevels, eq(achievementLevels.id, userAchievements.achievementLevelId))
    .where(eq(achievementLevels.achievementId, achievementId))
    .groupBy(userAchievements.achievementLevelId);
  return new Set(awarded.map((item) => item.levelId));
}

export async function createAchievementLevel(input: {
  achievementId: number;
  description: string | null;
  imageObjectKey: string | null;
  name: string | null;
  rarity: AchievementRarity;
  showcaseBackgroundImageObjectKey: string | null;
  threshold: number;
}) {
  if (
    !Number.isSafeInteger(input.threshold)
    || input.threshold < 1
    || !isAchievementRarity(input.rarity)
  ) throw new Error("invalid-achievement-levels");
  return db.transaction(async (tx) => {
    const [achievement] = await tx.select().from(achievements).where(eq(achievements.id, input.achievementId)).limit(1).for("update");
    if (!achievement) return null;
    const currentLevels = await tx.select().from(achievementLevels)
      .where(eq(achievementLevels.achievementId, input.achievementId))
      .orderBy(asc(achievementLevels.level))
      .for("update");
    const nextLevelNumber = currentLevels.length + 1;
    const previousThreshold = currentLevels.at(-1)?.threshold ?? 0;
    if (input.threshold <= previousThreshold) throw new Error("invalid-achievement-levels");
    const [created] = await tx.insert(achievementLevels).values({
      achievementId: input.achievementId,
      description: input.description,
      imageObjectKey: input.imageObjectKey,
      level: nextLevelNumber,
      name: input.name,
      rarity: input.rarity,
      showcaseBackgroundImageObjectKey: input.showcaseBackgroundImageObjectKey,
      threshold: input.threshold,
    }).returning();
    return created ?? null;
  });
}

export async function updateAchievementLevel(input: {
  achievementId: number;
  description: string | null;
  imageObjectKey: string | null;
  levelId: number;
  name: string | null;
  rarity: AchievementRarity;
  showcaseBackgroundImageObjectKey: string | null;
  threshold: number;
}) {
  if (
    !Number.isSafeInteger(input.threshold)
    || input.threshold < 1
    || !isAchievementRarity(input.rarity)
  ) throw new Error("invalid-achievement-levels");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(achievementLevels)
      .where(and(eq(achievementLevels.id, input.levelId), eq(achievementLevels.achievementId, input.achievementId)))
      .limit(1)
      .for("update");
    if (!current) return null;
    const currentLevels = await tx.select().from(achievementLevels)
      .where(eq(achievementLevels.achievementId, input.achievementId))
      .orderBy(asc(achievementLevels.level))
      .for("update");
    const awardedIds = await getAwardedLevelIds(tx, input.achievementId);
    if (awardedIds.has(input.levelId) && input.threshold > current.threshold) throw new Error("achievement-level-locked");
    const previousLevel = currentLevels.find((item) => item.level === current.level - 1);
    const nextLevel = currentLevels.find((item) => item.level === current.level + 1);
    if (previousLevel && input.threshold <= previousLevel.threshold) throw new Error("invalid-achievement-levels");
    if (nextLevel && input.threshold >= nextLevel.threshold) throw new Error("invalid-achievement-levels");
    const [updated] = await tx.update(achievementLevels).set({
      description: input.description,
      imageObjectKey: input.imageObjectKey,
      name: input.name,
      rarity: input.rarity,
      showcaseBackgroundImageObjectKey: input.showcaseBackgroundImageObjectKey,
      threshold: input.threshold,
      updatedAt: new Date(),
    }).where(and(eq(achievementLevels.id, input.levelId), eq(achievementLevels.achievementId, input.achievementId)))
      .returning();
    return updated ?? null;
  });
}

export async function deleteAchievementLevel(input: { achievementId: number; levelId: number }) {
  return db.transaction(async (tx) => {
    const currentLevels = await tx.select().from(achievementLevels)
      .where(eq(achievementLevels.achievementId, input.achievementId))
      .orderBy(asc(achievementLevels.level))
      .for("update");
    if (currentLevels.length <= 1) throw new Error("achievement-level-last");
    const target = currentLevels.find((item) => item.id === input.levelId);
    if (!target) return null;
    const awardedIds = await getAwardedLevelIds(tx, input.achievementId);
    if (awardedIds.has(input.levelId)) throw new Error("achievement-level-locked");
    await tx.delete(achievementLevels).where(eq(achievementLevels.id, input.levelId));
    const remaining = currentLevels.filter((item) => item.id !== input.levelId);
    for (let index = 0; index < remaining.length; index += 1) {
      const level = remaining[index]!;
      if (level.level !== index + 1) {
        await tx.update(achievementLevels).set({ level: index + 1, updatedAt: new Date() })
          .where(eq(achievementLevels.id, level.id));
      }
    }
    return target;
  });
}

export async function setAchievementEnabled(id: number, enabled: boolean) {
  const [updated] = await db.update(achievements)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(achievements.id, id))
    .returning()
  return updated ?? null
}

export async function deleteAchievementIfUnawarded(id: number) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(achievements).where(eq(achievements.id, id)).limit(1).for("update")
    if (!current) return null
    const levels = await tx.select({
      id: achievementLevels.id,
      imageObjectKey: achievementLevels.imageObjectKey,
      showcaseBackgroundImageObjectKey: achievementLevels.showcaseBackgroundImageObjectKey,
    }).from(achievementLevels).where(eq(achievementLevels.achievementId, id)).for("update")
    const awardedIds = await getAwardedLevelIds(tx, id)
    if (awardedIds.size > 0) throw new Error("achievement-awarded")
    await tx.delete(achievements).where(eq(achievements.id, id))
    return {
      ...current,
      imageObjectKeys: levels.flatMap((level) => [
        level.imageObjectKey,
        level.showcaseBackgroundImageObjectKey,
      ]),
    }
  })
}

export async function isAssignedAchievementImageObjectKey(objectKey: string) {
  const [level, settings] = await Promise.all([
    db.select({ id: achievementLevels.id }).from(achievementLevels)
      .where(or(
        eq(achievementLevels.imageObjectKey, objectKey),
        eq(achievementLevels.showcaseBackgroundImageObjectKey, objectKey),
      )).limit(1),
    db.select({ id: achievementSettings.id }).from(achievementSettings)
      .where(or(
        eq(achievementSettings.lockedImageObjectKey, objectKey),
        eq(achievementSettings.defaultShowcaseBackgroundImageObjectKey, objectKey),
      )).limit(1),
  ]);
  return Boolean(level[0] || settings[0]);
}

export async function claimPendingAchievementAnnouncement(authorId: number) {
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select({ awardGroupId: userAchievements.awardGroupId })
      .from(userAchievements)
      .where(and(
        eq(userAchievements.authorId, authorId),
        isNull(userAchievements.announcedAt),
      ))
      .orderBy(asc(userAchievements.awardedAt), asc(userAchievements.id))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!pending) return null;

    const claimed = await tx
      .update(userAchievements)
      .set({ announcedAt: new Date() })
      .where(and(
        eq(userAchievements.authorId, authorId),
        eq(userAchievements.awardGroupId, pending.awardGroupId),
        isNull(userAchievements.announcedAt),
      ))
      .returning({ achievementLevelId: userAchievements.achievementLevelId });

    if (claimed.length === 0) return null;

    const claimedAchievements = await tx
      .select({
        levelId: achievementLevels.id,
        levelImageObjectKey: achievementLevels.imageObjectKey,
        levelName: achievementLevels.name,
        name: achievements.name,
      })
      .from(achievementLevels)
      .innerJoin(achievements, eq(achievements.id, achievementLevels.achievementId))
      .where(inArray(achievementLevels.id, claimed.map((item) => item.achievementLevelId)))
      .orderBy(asc(achievements.displayOrder), asc(achievementLevels.level));

    return {
      awardGroupId: pending.awardGroupId,
      achievements: claimedAchievements.map((achievement) => ({
        id: achievement.levelId,
        imageUrl: resolveAchievementImageUrl(achievement.levelImageObjectKey),
        name: achievement.levelName ?? achievement.name,
      })),
    };
  });
}
