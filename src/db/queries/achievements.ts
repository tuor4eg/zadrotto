import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { achievements, userAchievements } from "@/db/schema";
import { resolveAchievementImageUrl } from "@/lib/achievements/images";

export async function getAchievementShowcase(authorId: number) {
  const rows = await db
    .select({
      awardedAt: userAchievements.awardedAt,
      code: achievements.code,
      description: achievements.description,
      imageObjectKey: achievements.imageObjectKey,
      name: achievements.name,
    })
    .from(achievements)
    .leftJoin(
      userAchievements,
      and(
        eq(userAchievements.achievementId, achievements.id),
        eq(userAchievements.authorId, authorId),
      ),
    )
    .where(or(
      isNotNull(userAchievements.id),
      and(eq(achievements.enabled, true), eq(achievements.showWhenLocked, true)),
    ))
    .orderBy(asc(achievements.displayOrder), asc(achievements.id));

  return rows.map(({ imageObjectKey, ...row }) => ({
    ...row,
    imageUrl: resolveAchievementImageUrl(imageObjectKey),
  }));
}

export async function getAdminAchievements() {
  const rows = await db.select().from(achievements)
    .orderBy(asc(achievements.displayOrder), asc(achievements.id));
  return rows.map((row) => ({ ...row, imageUrl: resolveAchievementImageUrl(row.imageObjectKey) }));
}

export async function getAdminAchievementById(id: number) {
  const [row] = await db.select().from(achievements).where(eq(achievements.id, id)).limit(1);
  return row ? { ...row, imageUrl: resolveAchievementImageUrl(row.imageObjectKey) } : null;
}

export async function updateAchievementPresentation(input: {
  description: string;
  enabled: boolean;
  id: number;
  imageObjectKey: string | null;
  name: string;
  showWhenLocked: boolean;
}) {
  const [updated] = await db.update(achievements).set({
    description: input.description,
    enabled: input.enabled,
    imageObjectKey: input.imageObjectKey,
    name: input.name,
    showWhenLocked: input.showWhenLocked,
    updatedAt: new Date(),
  }).where(eq(achievements.id, input.id)).returning();
  return updated ?? null;
}

export async function isAssignedAchievementImageObjectKey(objectKey: string) {
  const [row] = await db.select({ id: achievements.id }).from(achievements)
    .where(eq(achievements.imageObjectKey, objectKey)).limit(1);
  return Boolean(row);
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
      .returning({ achievementId: userAchievements.achievementId });

    if (claimed.length === 0) return null;

    const claimedAchievements = await tx
      .select({ name: achievements.name })
      .from(achievements)
      .where(inArray(achievements.id, claimed.map((item) => item.achievementId)))
      .orderBy(asc(achievements.displayOrder));

    return {
      awardGroupId: pending.awardGroupId,
      count: claimedAchievements.length,
      name: claimedAchievements.length === 1 ? claimedAchievements[0]?.name ?? null : null,
    };
  });
}
