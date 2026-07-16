import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authorAccessProfiles, authors } from "@/db/schema";
import type { AuthorAccessProfileFormInput } from "@/lib/forms/author-access-profile";
import {
  REGULAR_AUTHOR_ACCESS_PROFILE_CODE,
  type AuthorAccessProfileCode,
} from "@/lib/authors/access-profiles";

const authorsCountSql = sql<number>`count(${authors.id})::int`;

export async function getAuthorAccessProfiles(input?: { assignableOnly?: boolean }) {
  const profiles = await db
    .select({
      id: authorAccessProfiles.id,
      code: authorAccessProfiles.code,
      name: authorAccessProfiles.name,
      isSystem: authorAccessProfiles.isSystem,
      canPublishMediaWithoutReview: authorAccessProfiles.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: authorAccessProfiles.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: authorAccessProfiles.maxDraftMediaItemsPerDay,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
      coverSearchesPerMinute: authorAccessProfiles.coverSearchesPerMinute,
      coverSearchesPerHour: authorAccessProfiles.coverSearchesPerHour,
      coverSearchesPerDay: authorAccessProfiles.coverSearchesPerDay,
    })
    .from(authorAccessProfiles)
    .orderBy(asc(authorAccessProfiles.isSystem), asc(authorAccessProfiles.name));

  return input?.assignableOnly ? profiles.filter((profile) => !profile.isSystem) : profiles;
}

export async function getAdminAuthorAccessProfiles() {
  return db
    .select({
      id: authorAccessProfiles.id,
      code: authorAccessProfiles.code,
      name: authorAccessProfiles.name,
      isSystem: authorAccessProfiles.isSystem,
      canPublishMediaWithoutReview: authorAccessProfiles.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: authorAccessProfiles.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: authorAccessProfiles.maxDraftMediaItemsPerDay,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
      coverSearchesPerMinute: authorAccessProfiles.coverSearchesPerMinute,
      coverSearchesPerHour: authorAccessProfiles.coverSearchesPerHour,
      coverSearchesPerDay: authorAccessProfiles.coverSearchesPerDay,
      authorsCount: authorsCountSql,
    })
    .from(authorAccessProfiles)
    .leftJoin(authors, eq(authors.accessProfileId, authorAccessProfiles.id))
    .groupBy(
      authorAccessProfiles.id,
      authorAccessProfiles.code,
      authorAccessProfiles.name,
      authorAccessProfiles.isSystem,
      authorAccessProfiles.canPublishMediaWithoutReview,
      authorAccessProfiles.canPublishFranchisesWithoutReview,
      authorAccessProfiles.maxDraftMediaItems,
      authorAccessProfiles.maxDraftMediaItemsPerDay,
      authorAccessProfiles.maxUploadBytes,
      authorAccessProfiles.maxFilesPerMediaItem,
      authorAccessProfiles.coverSearchesPerMinute,
      authorAccessProfiles.coverSearchesPerHour,
      authorAccessProfiles.coverSearchesPerDay,
    )
    .orderBy(asc(authorAccessProfiles.isSystem), asc(authorAccessProfiles.name));
}

export async function getAuthorAccessProfileById(id: number) {
  const [profile] = await db
    .select({
      id: authorAccessProfiles.id,
      code: authorAccessProfiles.code,
      name: authorAccessProfiles.name,
      isSystem: authorAccessProfiles.isSystem,
      canPublishMediaWithoutReview: authorAccessProfiles.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: authorAccessProfiles.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: authorAccessProfiles.maxDraftMediaItemsPerDay,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
      coverSearchesPerMinute: authorAccessProfiles.coverSearchesPerMinute,
      coverSearchesPerHour: authorAccessProfiles.coverSearchesPerHour,
      coverSearchesPerDay: authorAccessProfiles.coverSearchesPerDay,
    })
    .from(authorAccessProfiles)
    .where(eq(authorAccessProfiles.id, id))
    .limit(1);

  return profile ?? null;
}

export async function createAuthorAccessProfile(input: AuthorAccessProfileFormInput & {
  code: string;
}) {
  const [profile] = await db
    .insert(authorAccessProfiles)
    .values({
      code: input.code,
      name: input.name,
      canPublishMediaWithoutReview: input.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: input.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: input.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: input.maxDraftMediaItemsPerDay,
      maxUploadBytes: input.maxUploadBytes,
      maxFilesPerMediaItem: input.maxFilesPerMediaItem,
      coverSearchesPerMinute: input.coverSearchesPerMinute,
      coverSearchesPerHour: input.coverSearchesPerHour,
      coverSearchesPerDay: input.coverSearchesPerDay,
    })
    .returning({
      id: authorAccessProfiles.id,
    });

  return profile;
}

export async function updateAuthorAccessProfile(input: AuthorAccessProfileFormInput & {
  id: number;
}) {
  const [profile] = await db
    .update(authorAccessProfiles)
    .set({
      name: input.name,
      canPublishMediaWithoutReview: input.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: input.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: input.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: input.maxDraftMediaItemsPerDay,
      maxUploadBytes: input.maxUploadBytes,
      maxFilesPerMediaItem: input.maxFilesPerMediaItem,
      coverSearchesPerMinute: input.coverSearchesPerMinute,
      coverSearchesPerHour: input.coverSearchesPerHour,
      coverSearchesPerDay: input.coverSearchesPerDay,
      updatedAt: new Date(),
    })
    .where(eq(authorAccessProfiles.id, input.id))
    .returning({
      id: authorAccessProfiles.id,
    });

  return profile ?? null;
}

export async function deleteAuthorAccessProfileIfUnused(id: number) {
  const [usage] = await db
    .select({
      id: authorAccessProfiles.id,
      authorsCount: authorsCountSql,
    })
    .from(authorAccessProfiles)
    .leftJoin(authors, eq(authors.accessProfileId, authorAccessProfiles.id))
    .where(eq(authorAccessProfiles.id, id))
    .groupBy(authorAccessProfiles.id)
    .limit(1);

  if (!usage) {
    return "not-found" as const;
  }

  if (usage.authorsCount > 0) {
    return "has-authors" as const;
  }

  const [profile] = await db
    .delete(authorAccessProfiles)
    .where(eq(authorAccessProfiles.id, id))
    .returning({
      id: authorAccessProfiles.id,
    });

  return profile ? "deleted" as const : "not-found" as const;
}

export async function getAuthorAccessProfileByCode(code: AuthorAccessProfileCode) {
  const [profile] = await db
    .select({
      id: authorAccessProfiles.id,
      code: authorAccessProfiles.code,
      name: authorAccessProfiles.name,
      isSystem: authorAccessProfiles.isSystem,
      canPublishMediaWithoutReview: authorAccessProfiles.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: authorAccessProfiles.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: authorAccessProfiles.maxDraftMediaItemsPerDay,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
      coverSearchesPerMinute: authorAccessProfiles.coverSearchesPerMinute,
      coverSearchesPerHour: authorAccessProfiles.coverSearchesPerHour,
      coverSearchesPerDay: authorAccessProfiles.coverSearchesPerDay,
    })
    .from(authorAccessProfiles)
    .where(eq(authorAccessProfiles.code, code))
    .limit(1);

  return profile ?? null;
}

export async function getDefaultAuthorAccessProfile() {
  return getAuthorAccessProfileByCode(REGULAR_AUTHOR_ACCESS_PROFILE_CODE);
}
