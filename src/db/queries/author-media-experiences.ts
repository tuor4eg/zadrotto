import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { authorMediaExperiences } from "@/db/schema";
import type { FirstExperiencedPrecision } from "@/lib/author-media-experiences";

export async function upsertAuthorMediaExperience(input: {
  authorId: number;
  mediaItemId: number;
  firstExperiencedAt: string;
  firstExperiencedPrecision: FirstExperiencedPrecision;
}) {
  const now = new Date();

  await db
    .insert(authorMediaExperiences)
    .values({
      authorId: input.authorId,
      mediaItemId: input.mediaItemId,
      firstExperiencedAt: input.firstExperiencedAt,
      firstExperiencedPrecision: input.firstExperiencedPrecision,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [authorMediaExperiences.mediaItemId, authorMediaExperiences.authorId],
      set: {
        firstExperiencedAt: input.firstExperiencedAt,
        firstExperiencedPrecision: input.firstExperiencedPrecision,
        updatedAt: now,
      },
    });
}

export async function deleteAuthorMediaExperience(input: {
  authorId: number;
  mediaItemId: number;
}) {
  await db
    .delete(authorMediaExperiences)
    .where(
      and(
        eq(authorMediaExperiences.authorId, input.authorId),
        eq(authorMediaExperiences.mediaItemId, input.mediaItemId),
      ),
    );
}
