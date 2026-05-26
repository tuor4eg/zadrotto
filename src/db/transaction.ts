import { sql } from "drizzle-orm";

import { db } from "@/db";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const AUTHOR_ADVISORY_LOCK_NAMESPACE = 42_001;

export function runInTransaction<TResult>(
  callback: (tx: DbTransaction) => Promise<TResult>,
) {
  return db.transaction(callback);
}

export async function lockAuthorForTransaction(tx: DbTransaction, authorId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AUTHOR_ADVISORY_LOCK_NAMESPACE}, ${authorId})`,
  );
}
