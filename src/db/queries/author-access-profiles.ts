import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorAccessProfileMediaTypes,
  authorAccessProfiles,
  authorRegistrationSettings,
  authors,
  mediaTypes,
} from "@/db/schema";
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

  if (!profile) {
    return null;
  }

  const mediaTypeGrants = await db
    .select({ mediaTypeId: authorAccessProfileMediaTypes.mediaTypeId })
    .from(authorAccessProfileMediaTypes)
    .where(eq(authorAccessProfileMediaTypes.accessProfileId, id));

  return {
    ...profile,
    mediaTypeIds: mediaTypeGrants.map(({ mediaTypeId }) => mediaTypeId),
  };
}

export async function createAuthorAccessProfile(input: AuthorAccessProfileFormInput & {
  code: string;
  mediaTypeIds: number[];
}) {
  return db.transaction(async (tx) => {
    const grantableIds = input.mediaTypeIds.length === 0
      ? []
      : await tx
        .select({ id: mediaTypes.id })
        .from(mediaTypes)
        .where(and(
          inArray(mediaTypes.id, input.mediaTypeIds),
          eq(mediaTypes.isAvailableToGuests, false),
        ));

    if (grantableIds.length !== new Set(input.mediaTypeIds).size) {
      throw new Error("Unknown or guest media type grant");
    }

    const [profile] = await tx
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
      .returning({ id: authorAccessProfiles.id });

    if (input.mediaTypeIds.length > 0) {
      await tx.insert(authorAccessProfileMediaTypes).values(
        input.mediaTypeIds.map((mediaTypeId) => ({
          accessProfileId: profile.id,
          mediaTypeId,
        })),
      );
    }

    return profile;
  });
}

export async function updateAuthorAccessProfile(input: AuthorAccessProfileFormInput & {
  id: number;
  mediaTypeIds: number[];
}) {
  return db.transaction(async (tx) => {
    const nonGuestTypes = await tx
      .select({ id: mediaTypes.id })
      .from(mediaTypes)
      .where(eq(mediaTypes.isAvailableToGuests, false));
    const nonGuestIds = nonGuestTypes.map(({ id }) => id);
    const requestedIds = [...new Set(input.mediaTypeIds)];

    if (requestedIds.some((id) => !nonGuestIds.includes(id))) {
      throw new Error("Unknown or guest media type grant");
    }

    const [profile] = await tx
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
      .returning({ id: authorAccessProfiles.id });

    if (!profile) {
      return null;
    }

    if (nonGuestIds.length > 0) {
      await tx
        .delete(authorAccessProfileMediaTypes)
        .where(and(
          eq(authorAccessProfileMediaTypes.accessProfileId, input.id),
          inArray(authorAccessProfileMediaTypes.mediaTypeId, nonGuestIds),
        ));
    }

    if (requestedIds.length > 0) {
      await tx.insert(authorAccessProfileMediaTypes).values(
        requestedIds.map((mediaTypeId) => ({
          accessProfileId: input.id,
          mediaTypeId,
        })),
      );
    }

    return profile;
  });
}

export async function deleteAuthorAccessProfileIfUnused(id: number) {
  const [registrationDefault] = await db
    .select({ id: authorRegistrationSettings.id })
    .from(authorRegistrationSettings)
    .where(eq(authorRegistrationSettings.accessProfileId, id))
    .limit(1);

  if (registrationDefault) {
    return "registration-default" as const;
  }

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
