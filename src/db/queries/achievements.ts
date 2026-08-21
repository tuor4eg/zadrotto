import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { getAchievementSettings } from "@/db/queries/achievement-settings";
import { achievementLevels, achievementSettings, achievements, userAchievements } from "@/db/schema";
import { resolveAchievementImageUrl } from "@/lib/achievements/images";
import { getAchievementProgressValues } from "@/lib/achievements/service";

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
      }]
    })
    const ownImageUrl = resolveAchievementImageUrl(presentation.levelImageObjectKey)
    return {
      awardedAt: awarded?.awardedAt ?? null,
      awardedLevels,
      code: presentation.code,
      currentValue: valueByAchievement.get(presentation.achievementId) ?? 0,
      description: presentation.levelDescription ?? presentation.description,
      highestAwardedLevel: awarded?.level ?? null,
      imageUrl: awarded ? ownImageUrl : settings.lockedImageUrl,
      levelCount: levels.length,
      name: presentation.levelName ?? presentation.name,
      nextLevel: nextLevel?.level ?? null,
      nextThreshold: nextLevel?.threshold ?? null,
    }
  });
}

export async function getAdminAchievements() {
  const [rows, awarded, levelImages] = await Promise.all([
    db.select().from(achievements)
      .orderBy(asc(achievements.displayOrder), asc(achievements.id)),
    db.selectDistinct({ achievementId: achievementLevels.achievementId })
      .from(userAchievements)
      .innerJoin(achievementLevels, eq(achievementLevels.id, userAchievements.achievementLevelId)),
    db.select({
      achievementId: achievementLevels.achievementId,
      imageObjectKey: achievementLevels.imageObjectKey,
      level: achievementLevels.level,
    }).from(achievementLevels)
      .where(isNotNull(achievementLevels.imageObjectKey))
      .orderBy(asc(achievementLevels.achievementId), desc(achievementLevels.level)),
  ])
  const awardedIds = new Set(awarded.map((item) => item.achievementId))
  const firstLevelImageByAchievement = new Map<number, string>()
  const highestLevelImageByAchievement = new Map<number, string>()
  for (const level of levelImages) {
    if (!level.imageObjectKey) continue
    if (level.level === 1) firstLevelImageByAchievement.set(level.achievementId, level.imageObjectKey)
    if (!highestLevelImageByAchievement.has(level.achievementId)) {
      highestLevelImageByAchievement.set(level.achievementId, level.imageObjectKey)
    }
  }
  return rows.map((row) => ({
    ...row,
    hasAwards: awardedIds.has(row.id),
    imageUrl: resolveAchievementImageUrl(
      firstLevelImageByAchievement.get(row.id) ?? highestLevelImageByAchievement.get(row.id) ?? null,
    ),
  }))
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
  threshold: number;
}) {
  if (!Number.isSafeInteger(input.threshold) || input.threshold < 1) throw new Error("invalid-achievement-levels");
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
  threshold: number;
}) {
  if (!Number.isSafeInteger(input.threshold) || input.threshold < 1) throw new Error("invalid-achievement-levels");
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
    }).from(achievementLevels).where(eq(achievementLevels.achievementId, id)).for("update")
    const awardedIds = await getAwardedLevelIds(tx, id)
    if (awardedIds.size > 0) throw new Error("achievement-awarded")
    await tx.delete(achievements).where(eq(achievements.id, id))
    return {
      ...current,
      imageObjectKeys: levels.map((level) => level.imageObjectKey),
    }
  })
}

export async function isAssignedAchievementImageObjectKey(objectKey: string) {
  const [level, settings] = await Promise.all([
    db.select({ id: achievementLevels.id }).from(achievementLevels)
      .where(eq(achievementLevels.imageObjectKey, objectKey)).limit(1),
    db.select({ id: achievementSettings.id }).from(achievementSettings)
      .where(eq(achievementSettings.lockedImageObjectKey, objectKey)).limit(1),
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
