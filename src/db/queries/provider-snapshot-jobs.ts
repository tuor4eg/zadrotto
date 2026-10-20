import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, mediaItemMetadata } from "@/db/schema";
import { SNAPSHOT_DEFAULT_BATCH_SIZE } from "@/lib/providers/snapshot-job-payload";
import type { BookProviderCode } from "@/lib/providers/types";

/** One extra row determines whether another batch exists, without a separate count. */
export function providerSnapshotBookBatchQuery(input:{afterId:number;throughId:number;provider?:BookProviderCode;mediaItemIds?:number[];batchSize?:number}) {
  return db.select({id:mediaItems.id,provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId})
    .from(mediaItemMetadata).innerJoin(mediaItems,eq(mediaItems.id,mediaItemMetadata.mediaItemId))
    .where(and(eq(mediaItems.mediaType,"book"),gt(mediaItemMetadata.mediaItemId,input.afterId),lte(mediaItemMetadata.mediaItemId,input.throughId),
      input.provider?eq(mediaItemMetadata.sourceProvider,input.provider):inArray(mediaItemMetadata.sourceProvider,["fantlab","google-books","open-library"]),
      input.mediaItemIds?inArray(mediaItemMetadata.mediaItemId,input.mediaItemIds):undefined))
    .orderBy(asc(mediaItemMetadata.mediaItemId)).limit((input.batchSize ?? SNAPSHOT_DEFAULT_BATCH_SIZE) + 1);
}
