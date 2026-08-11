import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { lockAuthorForTransaction, runInTransaction } from "@/db/transaction";
import type { AuthorMediaItemInput } from "@/db/queries/media-items";
import {
  getAuthorPrivateMediaItemLimitUsageForExecutor,
  setMediaItemFranchisesForExecutor,
  setMediaItemTitleAliasesForExecutor,
} from "@/db/queries/media-items";
import {
  checkAuthorPrivateMediaLimit,
  getPrivateMediaLimitWindowStart,
  type AuthorPrivateMediaLimitResult,
} from "@/lib/authors/private-media-limits";

type CreateAuthorPrivateMediaItemInput = AuthorMediaItemInput & {
  authorCreationRequestId: string;
  limits: {
    maxDraftMediaItems: number | null;
    maxDraftMediaItemsPerDay: number | null;
  };
};

type CreateAuthorPrivateMediaItemResult =
  | {
      ok: true;
      created: boolean;
      item: {
        id: number;
        code: string;
        publicationStatus: "private" | "submitted" | "published" | "rejected";
      };
    }
  | Extract<AuthorPrivateMediaLimitResult, { ok: false }>;

export async function getAuthorMediaItemByCreationRequestId(input: {
  authorCreationRequestId: string;
  authorId: number;
}) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      publicationStatus: mediaItems.publicationStatus,
    })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.createdByAuthorId, input.authorId),
        eq(mediaItems.authorCreationRequestId, input.authorCreationRequestId),
      ),
    )
    .limit(1);

  return item ?? null;
}

export async function createAuthorPrivateMediaItemWithLimitCheck(
  input: CreateAuthorPrivateMediaItemInput,
): Promise<CreateAuthorPrivateMediaItemResult> {
  return runInTransaction(async (tx) => {
    await lockAuthorForTransaction(tx, input.authorId);

    const [existingItem] = await tx
      .select({
        id: mediaItems.id,
        code: mediaItems.code,
        publicationStatus: mediaItems.publicationStatus,
      })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.createdByAuthorId, input.authorId),
          eq(mediaItems.authorCreationRequestId, input.authorCreationRequestId),
        ),
      )
      .limit(1);

    if (existingItem) {
      return { ok: true, created: false, item: existingItem };
    }

    const usage = await getAuthorPrivateMediaItemLimitUsageForExecutor(tx, {
      authorId: input.authorId,
      since: getPrivateMediaLimitWindowStart(),
    });
    const limit = checkAuthorPrivateMediaLimit({
      limits: input.limits,
      usage,
    });

    if (!limit.ok) {
      return limit;
    }

    const [item] = await tx
      .insert(mediaItems)
      .values({
        code: input.code,
        title: input.title,
        originalTitle: input.originalTitle,
        description: input.description,
        mediaType: input.mediaType,
        mediaCarrierId: input.mediaCarrierId,
        releaseYear: input.releaseYear,
        coverUrl: input.coverUrl,
        coverThumbUrl: input.coverThumbUrl,
        coverSourceProvider: input.coverSource.provider,
        coverSourceExternalId: input.coverSource.externalId,
        coverSourcePageUrl: input.coverSource.pageUrl,
        authorCreationRequestId: input.authorCreationRequestId,
        createdByAuthorId: input.authorId,
        publicationStatus: "private",
      })
      .returning({
        id: mediaItems.id,
        code: mediaItems.code,
        publicationStatus: mediaItems.publicationStatus,
      });

    if (!item) {
      throw new Error("Failed to create author media item");
    }

    await setMediaItemFranchisesForExecutor(tx, item.id, input.franchiseIds);
    await setMediaItemTitleAliasesForExecutor(tx, item.id, input.aliases ?? []);

    return { ok: true, created: true, item };
  });
}
