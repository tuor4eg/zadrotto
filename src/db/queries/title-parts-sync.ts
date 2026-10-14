import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { titleParts } from "@/db/schema";
import type { TitlePartProviderInput } from "@/lib/media/title-parts";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The caller locks the parent media_items row, serializing provider imports. */
export async function syncProviderTitleParts(tx: Transaction, input: {
  mediaItemId: number; provider: string; parts: readonly TitlePartProviderInput[];
}) {
  const existing = await tx.select().from(titleParts).where(eq(titleParts.mediaItemId, input.mediaItemId));
  const posters: Array<{ partId: number; imageUrl: string }> = [];
  const conflicts: Array<{ externalId: string; number: number }> = [];
  for (const part of input.parts) {
    // Also reject specials from older cached provider responses.
    if (part.type === "season" && part.number === 0) continue;
    const external = existing.find((row) => row.sourceProvider === input.provider && row.externalId === part.externalId);
    const numbered = existing.find((row) => row.type === part.type && row.number === part.number);
    if ((numbered && numbered.sourceProvider !== input.provider) || (external && numbered && external.id !== numbered.id)) {
      conflicts.push({ externalId: part.externalId, number: part.number });
      continue;
    }
    const previous = external ?? numbered;
    const values = { mediaItemId: input.mediaItemId, sourceProvider: input.provider, ...part, updatedAt: new Date() };
    const [row] = previous
      ? await tx.update(titleParts).set(values).where(eq(titleParts.id, previous.id)).returning()
      : await tx.insert(titleParts).values(values).returning();
    const index = existing.findIndex((item) => item.id === row.id);
    if (index < 0) existing.push(row); else existing[index] = row;
    if (row.posterSourceUrl && (!row.coverUrl || previous?.posterSourceUrl !== row.posterSourceUrl)) {
      posters.push({ partId: row.id, imageUrl: row.posterSourceUrl });
    }
  }
  return { posters, conflicts };
}

export async function getTitlePartPosterSource(partId: number, imageUrl: string) {
  const [row] = await db.select().from(titleParts).where(and(eq(titleParts.id, partId), eq(titleParts.posterSourceUrl, imageUrl),
    sql`NOT (${titleParts.type} = 'season' AND ${titleParts.number} = 0)`)).limit(1);
  return row ?? null;
}
