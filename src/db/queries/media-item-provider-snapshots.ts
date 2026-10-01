import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mediaItemProviderSnapshots } from "@/db/schema";

export type MediaItemProviderSnapshotInput = {
  mediaItemId: number;
  providerCode: string;
  externalId: string;
  mediaType: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
  releaseYear: number | null;
  sourceUrl: string | null;
  facts: Record<string, unknown>;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

export function getMediaItemProviderSnapshotHash(
  input: Omit<MediaItemProviderSnapshotInput, "mediaItemId">,
) {
  return createHash("sha256").update(JSON.stringify(stableValue(input))).digest("hex");
}

export async function upsertMediaItemProviderSnapshot(input: MediaItemProviderSnapshotInput) {
  const now = new Date();
  const payloadHash = getMediaItemProviderSnapshotHash(input);
  const [snapshot] = await db.insert(mediaItemProviderSnapshots).values({
    ...input,
    payloadHash,
    fetchedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: mediaItemProviderSnapshots.mediaItemId,
    set: {
      providerCode: input.providerCode,
      externalId: input.externalId,
      mediaType: input.mediaType,
      title: input.title,
      originalTitle: input.originalTitle,
      description: input.description,
      releaseYear: input.releaseYear,
      sourceUrl: input.sourceUrl,
      facts: input.facts,
      payloadHash,
      fetchedAt: now,
      updatedAt: now,
    },
  }).returning();
  return snapshot;
}

export async function deleteMediaItemProviderSnapshot(mediaItemId: number) {
  await db.delete(mediaItemProviderSnapshots)
    .where(eq(mediaItemProviderSnapshots.mediaItemId, mediaItemId));
}
