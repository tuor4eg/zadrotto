import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";

import { db } from "@/db";
import {
  authorMediaTypeSettings,
  authorAccessProfileMediaTypes,
  authors,
  mediaCarrierMediaTypes,
  mediaItems,
  mediaTypes,
} from "@/db/schema";
import type { MediaTypeFormInput } from "@/lib/forms/media-type";
import {
  resolveMediaTypeEnabled,
  type EffectiveMediaTypeOption,
  type MediaTypeOption,
} from "@/lib/media/types";

const mediaItemsCountSql = sql<number>`count(distinct ${mediaItems.id})::int`;
const mediaCarriersCountSql = sql<number>`count(distinct ${mediaCarrierMediaTypes.mediaCarrierId})::int`;
const otherMediaTypeLastSql = sql`case when ${mediaTypes.code} = 'other' then 1 else 0 end`;

export async function getAllMediaTypeOptions(): Promise<MediaTypeOption[]> {
  return db
    .select({
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
    })
    .from(mediaTypes)
    .leftJoin(mediaItems, eq(mediaItems.mediaType, mediaTypes.code))
    .groupBy(
      mediaTypes.code,
      mediaTypes.name,
      mediaTypes.description,
    )
    .orderBy(otherMediaTypeLastSql, desc(mediaItemsCountSql), asc(mediaTypes.name));
}

/** @deprecated Prefer an explicit all/public/effective media type query. */
export const getMediaTypeOptions = getAllMediaTypeOptions;

export async function getAdminMediaTypeAccessOptions() {
  return db
    .select({
      id: mediaTypes.id,
      code: mediaTypes.code,
      name: mediaTypes.name,
      isPubliclyAvailable: mediaTypes.isPubliclyAvailable,
      isAvailableToGuests: mediaTypes.isAvailableToGuests,
    })
    .from(mediaTypes)
    .orderBy(otherMediaTypeLastSql, asc(mediaTypes.name));
}

export async function getPubliclyAvailableMediaTypeCodes() {
  const rows = await db
    .select({ code: mediaTypes.code })
    .from(mediaTypes)
    .where(eq(mediaTypes.isPubliclyAvailable, true))
    .orderBy(asc(mediaTypes.code));

  return rows.map(({ code }) => code);
}

export async function getAccessibleMediaTypeOptions(authorId?: number) {
  const accessCondition = authorId === undefined
    ? eq(mediaTypes.isAvailableToGuests, true)
    : or(
      eq(mediaTypes.isAvailableToGuests, true),
      exists(
        db
          .select({ accessProfileId: authorAccessProfileMediaTypes.accessProfileId })
          .from(authors)
          .innerJoin(
            authorAccessProfileMediaTypes,
            eq(authorAccessProfileMediaTypes.accessProfileId, authors.accessProfileId),
          )
          .where(and(
            eq(authors.id, authorId),
            eq(authorAccessProfileMediaTypes.mediaTypeId, mediaTypes.id),
          )),
      ),
    );

  return db
    .select({
      id: mediaTypes.id,
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
      isPubliclyAvailable: mediaTypes.isPubliclyAvailable,
      isAvailableToGuests: mediaTypes.isAvailableToGuests,
      enabledByDefault: mediaTypes.enabledByDefault,
    })
    .from(mediaTypes)
    .where(and(eq(mediaTypes.isPubliclyAvailable, true), accessCondition))
    .orderBy(otherMediaTypeLastSql, asc(mediaTypes.name));
}

export async function getAccessibleMediaTypeCodes(authorId?: number) {
  return (await getAccessibleMediaTypeOptions(authorId)).map(({ code }) => code);
}

export async function getEffectiveMediaTypeOptions(
  authorId?: number,
): Promise<EffectiveMediaTypeOption[]> {
  const accessibleMediaTypes = await getAccessibleMediaTypeOptions(authorId);
  const accessibleIds = accessibleMediaTypes.map(({ id }) => id);

  if (accessibleIds.length === 0) {
    return [];
  }

  const selection = {
    id: mediaTypes.id,
    code: mediaTypes.code,
    name: mediaTypes.name,
    description: mediaTypes.description,
    isPubliclyAvailable: mediaTypes.isPubliclyAvailable,
    enabledByDefault: mediaTypes.enabledByDefault,
  };

  if (authorId === undefined) {
    const rows = await db
      .select(selection)
      .from(mediaTypes)
      .where(inArray(mediaTypes.id, accessibleIds))
      .orderBy(otherMediaTypeLastSql, asc(mediaTypes.name));

    return rows.map((mediaType) => ({
      ...mediaType,
      isEnabled: resolveMediaTypeEnabled(mediaType),
    }));
  }

  const rows = await db
    .select({
      ...selection,
      userIsEnabled: authorMediaTypeSettings.isEnabled,
    })
    .from(mediaTypes)
    .leftJoin(
      authorMediaTypeSettings,
      and(
        eq(authorMediaTypeSettings.mediaTypeId, mediaTypes.id),
        eq(authorMediaTypeSettings.authorId, authorId),
      ),
    )
    .where(inArray(mediaTypes.id, accessibleIds))
    .orderBy(otherMediaTypeLastSql, asc(mediaTypes.name));

  return rows.map(({ userIsEnabled, ...mediaType }) => ({
    ...mediaType,
    isEnabled: resolveMediaTypeEnabled(
      mediaType,
      userIsEnabled === null ? null : { isEnabled: userIsEnabled },
    ),
  }));
}

export async function getEnabledMediaTypeCodes(authorId?: number) {
  const options = await getEffectiveMediaTypeOptions(authorId);

  return options.filter(({ isEnabled }) => isEnabled).map(({ code }) => code);
}

export function getMediaTypeCodeFilterSql(
  mediaTypeColumn: SQLWrapper,
  enabledMediaTypeCodes: readonly string[],
) {
  if (enabledMediaTypeCodes.length === 0) {
    return sql<boolean>`false`;
  }

  return sql<boolean>`${mediaTypeColumn} in (${sql.join(
    enabledMediaTypeCodes.map((code) => sql`${code}`),
    sql`, `,
  )})`;
}

export async function getAdminMediaTypes() {
  return db
    .select({
      id: mediaTypes.id,
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
      isPubliclyAvailable: mediaTypes.isPubliclyAvailable,
      isAvailableToGuests: mediaTypes.isAvailableToGuests,
      enabledByDefault: mediaTypes.enabledByDefault,
      mediaItemsCount: mediaItemsCountSql,
      mediaCarriersCount: mediaCarriersCountSql,
    })
    .from(mediaTypes)
    .leftJoin(mediaItems, eq(mediaItems.mediaType, mediaTypes.code))
    .leftJoin(mediaCarrierMediaTypes, eq(mediaCarrierMediaTypes.mediaType, mediaTypes.code))
    .groupBy(
      mediaTypes.id,
      mediaTypes.code,
      mediaTypes.name,
      mediaTypes.description,
      mediaTypes.isPubliclyAvailable,
      mediaTypes.isAvailableToGuests,
      mediaTypes.enabledByDefault,
    )
    .orderBy(otherMediaTypeLastSql, desc(mediaItemsCountSql), asc(mediaTypes.name));
}

export async function getMediaTypeById(id: number) {
  const [mediaType] = await db
    .select({
      id: mediaTypes.id,
      code: mediaTypes.code,
      name: mediaTypes.name,
      description: mediaTypes.description,
      isPubliclyAvailable: mediaTypes.isPubliclyAvailable,
      isAvailableToGuests: mediaTypes.isAvailableToGuests,
      enabledByDefault: mediaTypes.enabledByDefault,
      mediaItemsCount: mediaItemsCountSql,
      mediaCarriersCount: mediaCarriersCountSql,
    })
    .from(mediaTypes)
    .leftJoin(mediaItems, eq(mediaItems.mediaType, mediaTypes.code))
    .leftJoin(mediaCarrierMediaTypes, eq(mediaCarrierMediaTypes.mediaType, mediaTypes.code))
    .where(eq(mediaTypes.id, id))
    .groupBy(
      mediaTypes.id,
      mediaTypes.code,
      mediaTypes.name,
      mediaTypes.description,
      mediaTypes.isPubliclyAvailable,
      mediaTypes.isAvailableToGuests,
      mediaTypes.enabledByDefault,
    )
    .limit(1);

  return mediaType ?? null;
}

export async function mediaTypeExistsByCode(code: string) {
  const [mediaType] = await db
    .select({ code: mediaTypes.code })
    .from(mediaTypes)
    .where(eq(mediaTypes.code, code))
    .limit(1);

  return Boolean(mediaType);
}

export async function createMediaType(input: MediaTypeFormInput & { code: string }) {
  const [mediaType] = await db
    .insert(mediaTypes)
    .values({
      code: input.code,
      name: input.name,
      description: input.description,
      isPubliclyAvailable: input.isPubliclyAvailable,
      isAvailableToGuests: input.isAvailableToGuests,
      enabledByDefault: input.enabledByDefault,
    })
    .returning({
      id: mediaTypes.id,
    });

  return mediaType;
}

export async function updateMediaType(input: MediaTypeFormInput & { id: number }) {
  const [mediaType] = await db
    .update(mediaTypes)
    .set({
      name: input.name,
      description: input.description,
      isPubliclyAvailable: input.isPubliclyAvailable,
      isAvailableToGuests: input.isAvailableToGuests,
      enabledByDefault: input.enabledByDefault,
      updatedAt: new Date(),
    })
    .where(eq(mediaTypes.id, input.id))
    .returning({
      id: mediaTypes.id,
    });

  return mediaType ?? null;
}

export async function setMediaTypePublicAvailability(id: number, isPubliclyAvailable: boolean) {
  const [mediaType] = await db
    .update(mediaTypes)
    .set({
      isPubliclyAvailable,
      updatedAt: new Date(),
    })
    .where(eq(mediaTypes.id, id))
    .returning({
      id: mediaTypes.id,
      isPubliclyAvailable: mediaTypes.isPubliclyAvailable,
    });

  return mediaType ?? null;
}

type AuthorMediaTypeSettingInput = {
  isEnabled: boolean;
  mediaTypeId: number;
};

export async function saveAuthorMediaTypeOverrides(input: {
  authorId: number;
  settings: readonly AuthorMediaTypeSettingInput[];
}) {
  return db.transaction(async (tx) => {
    const mediaTypeIds = input.settings.map(({ mediaTypeId }) => mediaTypeId);

    if (new Set(mediaTypeIds).size !== mediaTypeIds.length) {
      throw new Error("Duplicate media type setting");
    }

    if (mediaTypeIds.length === 0) {
      return { overridesCount: 0 };
    }

    const availableMediaTypes = await tx
      .select({
        id: mediaTypes.id,
        enabledByDefault: mediaTypes.enabledByDefault,
      })
      .from(mediaTypes)
      .where(and(
        inArray(mediaTypes.id, mediaTypeIds),
        eq(mediaTypes.isPubliclyAvailable, true),
      ));

    if (availableMediaTypes.length !== mediaTypeIds.length) {
      throw new Error("Unknown or unavailable media type setting");
    }

    const defaultById = new Map(
      availableMediaTypes.map(({ id, enabledByDefault }) => [id, enabledByDefault]),
    );
    const overrides = input.settings.filter(
      ({ mediaTypeId, isEnabled }) => defaultById.get(mediaTypeId) !== isEnabled,
    );

    await tx
      .delete(authorMediaTypeSettings)
      .where(and(
        eq(authorMediaTypeSettings.authorId, input.authorId),
        inArray(authorMediaTypeSettings.mediaTypeId, mediaTypeIds),
      ));

    if (overrides.length > 0) {
      await tx.insert(authorMediaTypeSettings).values(
        overrides.map(({ mediaTypeId, isEnabled }) => ({
          authorId: input.authorId,
          mediaTypeId,
          isEnabled,
        })),
      );
    }

    return { overridesCount: overrides.length };
  });
}

export async function resetAuthorMediaTypeOverrides(authorId: number) {
  const removed = await db
    .delete(authorMediaTypeSettings)
    .where(eq(authorMediaTypeSettings.authorId, authorId))
    .returning({ mediaTypeId: authorMediaTypeSettings.mediaTypeId });

  return { removedCount: removed.length };
}

export async function deleteMediaTypeIfUnused(id: number) {
  const mediaType = await getMediaTypeById(id);

  if (!mediaType) {
    return "not-found" as const;
  }

  if (mediaType.mediaItemsCount > 0 || mediaType.mediaCarriersCount > 0) {
    return "has-media" as const;
  }

  const [deletedMediaType] = await db
    .delete(mediaTypes)
    .where(eq(mediaTypes.id, id))
    .returning({
      id: mediaTypes.id,
    });

  return deletedMediaType ? "deleted" as const : "not-found" as const;
}
