import { sql } from "drizzle-orm";
import type { DbTransaction } from "@/db/transaction";

/** Shared fence for classification mutations and the confirmed migration. Take before row locks. */
export async function lockClassificationMutations(tx: DbTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(76120341)`);
}
