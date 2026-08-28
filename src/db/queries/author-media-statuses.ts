import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authorMediaStatuses, ratings } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import type { AuthorMediaStatus } from "@/lib/media/author-media-status";

export class AuthorMediaStatusConflictError extends Error {}

export async function getAuthorMediaStatus(input: {
  authorId: number;
  mediaItemId: number;
}) {
  const [row] = await db
    .select({ status: authorMediaStatuses.status })
    .from(authorMediaStatuses)
    .where(
      and(
        eq(authorMediaStatuses.authorId, input.authorId),
        eq(authorMediaStatuses.mediaItemId, input.mediaItemId),
      ),
    )
    .limit(1);

  return row?.status ?? null;
}

export async function lockAuthorMediaState(
  tx: DbTransaction,
  input: { authorId: number; mediaItemId: number },
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${input.authorId}::integer, ${input.mediaItemId}::integer)`,
  );
}

export async function toggleAuthorMediaStatus(input: {
  authorId: number;
  mediaItemId: number;
  status: AuthorMediaStatus;
}) {
  return db.transaction(async (tx) => {
    await lockAuthorMediaState(tx, input);

    const [rating] = await tx
      .select({ id: ratings.id })
      .from(ratings)
      .where(and(eq(ratings.authorId, input.authorId), eq(ratings.mediaItemId, input.mediaItemId)))
      .limit(1);

    if (rating) {
      throw new AuthorMediaStatusConflictError();
    }

    const [current] = await tx
      .select({ status: authorMediaStatuses.status })
      .from(authorMediaStatuses)
      .where(
        and(
          eq(authorMediaStatuses.authorId, input.authorId),
          eq(authorMediaStatuses.mediaItemId, input.mediaItemId),
        ),
      )
      .limit(1);

    if (current?.status === input.status) {
      await tx
        .delete(authorMediaStatuses)
        .where(
          and(
            eq(authorMediaStatuses.authorId, input.authorId),
            eq(authorMediaStatuses.mediaItemId, input.mediaItemId),
          ),
        );
      return null;
    }

    const now = new Date();
    await tx
      .insert(authorMediaStatuses)
      .values({ ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [authorMediaStatuses.authorId, authorMediaStatuses.mediaItemId],
        set: { status: input.status, updatedAt: now },
      });

    return input.status;
  });
}

export async function setAuthorMediaStatus(input: {
  authorId: number;
  mediaItemId: number;
  status: AuthorMediaStatus;
}) {
  return db.transaction(async (tx) => {
    await lockAuthorMediaState(tx, input);
    const [rating] = await tx
      .select({ id: ratings.id })
      .from(ratings)
      .where(and(eq(ratings.authorId, input.authorId), eq(ratings.mediaItemId, input.mediaItemId)))
      .limit(1);
    if (rating) throw new AuthorMediaStatusConflictError();

    const now = new Date();
    await tx.insert(authorMediaStatuses).values({ ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [authorMediaStatuses.authorId, authorMediaStatuses.mediaItemId],
        set: { status: input.status, updatedAt: now },
      });
    return input.status;
  });
}
