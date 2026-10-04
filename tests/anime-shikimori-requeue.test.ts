import assert from "node:assert/strict";
import { after, it, mock } from "node:test";
import { getDb, getDbClient } from "@/db";
import { requeueAnimeShikimoriItem } from "@/db/queries/anime-shikimori-backfill";

// The client is never connected: transactions are replaced below.
process.env.DATABASE_URL ??= "postgres://localhost/shikimori_test";
after(async () => { await getDbClient().end(); });

for (const description of [
  "[character=1]Рахиль[/character] встретила героя.",
  "Описание исправлено вручную после предварительного просмотра.",
  null,
  undefined,
]) {
  it(`rechecks locked description before requeue: ${String(description)}`, async () => {
    const writes: unknown[] = [];
    let locked = false;
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      for: (mode: string) => { assert.equal(mode, "update"); locked = true; return query; },
      limit: async () => description === undefined ? [] : [{ description }],
    };
    const tx = {
      select: () => query,
      update: () => ({
        set: (values: unknown) => {
          assert.equal(locked, true);
          writes.push(values);
          return { where: async () => undefined };
        },
      }),
    };
    const transaction = mock.method(getDb(), "transaction", async (callback: (value: typeof tx) => Promise<boolean>) => callback(tx));
    try {
      const result = await requeueAnimeShikimoriItem({ id: 1, attemptedAt: new Date() });
      const expected = description === null || description?.startsWith("[character") === true;
      assert.equal(result, expected);
      assert.deepEqual(writes, expected ? [{ shikimoriEnrichmentAttemptedAt: null }] : []);
      assert.equal(await requeueAnimeShikimoriItem({ id: 1, attemptedAt: null }), false);
    } finally {
      transaction.mock.restore();
    }
  });
}
