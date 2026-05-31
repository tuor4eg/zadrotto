import { mediaItems } from "@/db/schema";
import { lockAuthorForTransaction, runInTransaction } from "@/db/transaction";
import type { AuthorMediaItemInput } from "@/db/queries/media-items";
import { getAuthorPrivateMediaItemLimitUsageForExecutor } from "@/db/queries/media-items";
import {
  checkAuthorPrivateMediaLimit,
  getPrivateMediaLimitWindowStart,
  type AuthorPrivateMediaLimitResult,
} from "@/lib/author-private-media-limits";

type CreateAuthorPrivateMediaItemInput = AuthorMediaItemInput & {
  limits: {
    maxDraftMediaItems: number | null;
    maxDraftMediaItemsPerDay: number | null;
  };
};

type CreateAuthorPrivateMediaItemResult =
  | { ok: true; item: { id: number; code: string } }
  | Extract<AuthorPrivateMediaLimitResult, { ok: false }>;

export async function createAuthorPrivateMediaItemWithLimitCheck(
  input: CreateAuthorPrivateMediaItemInput,
): Promise<CreateAuthorPrivateMediaItemResult> {
  return runInTransaction(async (tx) => {
    await lockAuthorForTransaction(tx, input.authorId);

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
        franchiseId: input.franchiseId,
        mediaCarrierId: input.mediaCarrierId,
        releaseYear: input.releaseYear,
        coverUrl: input.coverUrl,
        createdByAuthorId: input.authorId,
        publicationStatus: "private",
      })
      .returning({
        id: mediaItems.id,
        code: mediaItems.code,
      });

    if (!item) {
      throw new Error("Failed to create author media item");
    }

    return { ok: true, item };
  });
}
