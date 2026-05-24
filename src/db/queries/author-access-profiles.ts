import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authorAccessProfiles, authors } from "@/db/schema";
import type { AuthorAccessProfileFormInput } from "@/lib/author-access-profile-form";
import {
  REGULAR_AUTHOR_ACCESS_PROFILE_CODE,
  type AuthorAccessProfileCode,
} from "@/lib/author-access-profiles";

const authorsCountSql = sql<number>`count(${authors.id})::int`;

export async function getAuthorAccessProfiles(input?: { assignableOnly?: boolean }) {
  const profiles = await db
    .select({
      id: authorAccessProfiles.id,
      code: authorAccessProfiles.code,
      name: authorAccessProfiles.name,
      isSystem: authorAccessProfiles.isSystem,
      canPublishMediaWithoutReview: authorAccessProfiles.canPublishMediaWithoutReview,
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
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
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
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
      authorAccessProfiles.maxDraftMediaItems,
      authorAccessProfiles.maxUploadBytes,
      authorAccessProfiles.maxFilesPerMediaItem,
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
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
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
      maxDraftMediaItems: input.maxDraftMediaItems,
      maxUploadBytes: input.maxUploadBytes,
      maxFilesPerMediaItem: input.maxFilesPerMediaItem,
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
      maxDraftMediaItems: input.maxDraftMediaItems,
      maxUploadBytes: input.maxUploadBytes,
      maxFilesPerMediaItem: input.maxFilesPerMediaItem,
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
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
    })
    .from(authorAccessProfiles)
    .where(eq(authorAccessProfiles.code, code))
    .limit(1);

  return profile ?? null;
}

export async function getDefaultAuthorAccessProfile() {
  return getAuthorAccessProfileByCode(REGULAR_AUTHOR_ACCESS_PROFILE_CODE);
}
