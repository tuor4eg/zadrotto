import { and, eq, isNull } from "drizzle-orm";
import { authors, authorAccessProfiles } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";

export async function authorCanManageFranchisesForExecutor(tx: DbTransaction, authorId: number) {
  const [author] = await tx.select({ id: authors.id }).from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .where(and(eq(authors.id, authorId), eq(authors.isSystem, false), eq(authorAccessProfiles.code, "trusted"),
      isNull(authors.blockedAt), isNull(authors.mergedIntoAuthorId)));
  return Boolean(author);
}
export async function requireFranchiseManagerForExecutor(tx: DbTransaction, authorId: number) {
  if (!await authorCanManageFranchisesForExecutor(tx, authorId)) throw new Error("franchise-forbidden");
}
