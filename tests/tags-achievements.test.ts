import assert from "node:assert/strict";
import { test } from "node:test";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { getAchievementMechanic, type CountMechanicParams } from "../src/lib/achievements/catalog";
import type { DbTransaction } from "../src/db/transaction";

const countMechanics = ["rating.authored.count", "review.authored.count", "media.authored.count"] as const;

test("tag achievement parameters accept a positive ID and reject a simultaneous series", () => {
  for (const code of countMechanics) {
    const mechanic = getAchievementMechanic(code)!;
    assert.deepEqual(mechanic.parseParams({ tagId: 23, mediaType: " film " }), { tagId: 23, mediaType: "film" });
    assert.deepEqual(mechanic.parseParams({ seriesId: 17 }), { seriesId: 17 });
    assert.throws(() => mechanic.parseParams({ tagId: 23, seriesId: 17 }));
    for (const tagId of [0, -1, 1.5, "23", null, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => mechanic.parseParams({ tagId }), `${code}: ${String(tagId)}`);
    }
  }
});

test("all authored mechanics use public tag membership and preserve duplicate configuration results", async () => {
  const dialect = new PgDialect();
  for (const code of countMechanics) {
    const queries: ReturnType<typeof dialect.sqlToQuery>[] = [];
    const tx = { execute: async (query: SQL) => {
      queries.push(dialect.sqlToQuery(query));
      return [{ groupIndex: 0, authorId: 7, value: 2 }];
    } } as unknown as DbTransaction;
    const params: CountMechanicParams = { tagId: 23, mediaType: "film" };
    const result = await getAchievementMechanic(code)!.evaluateBatch({ tx, authorIds: [7], instances: [
      { achievementId: 1, params }, { achievementId: 2, params },
    ] });
    assert.deepEqual(result, [{ achievementId: 1, authorId: 7, value: 2 }, { achievementId: 2, authorId: 7, value: 2 }]);
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /from media_item_tags assignment/);
    assert.match(queries[0].sql, /bool_or\(tag_author\.is_system\)/);
    assert.match(queries[0].sql, /tag_publication_threshold/);
    assert.doesNotMatch(queries[0].sql, /media_item_franchises/);
    assert.ok(queries[0].params.includes(23));
  }
});

test("different tag filters retain independent grouped progress", async () => {
  const dialect = new PgDialect();
  for (const code of countMechanics) {
    let compiled!: ReturnType<typeof dialect.sqlToQuery>;
    const tx = { execute: async (query: SQL) => {
      compiled = dialect.sqlToQuery(query);
      return code === "media.authored.count"
        ? [{ groupIndex: 0, authorId: 7, value: 2 }, { groupIndex: 1, authorId: 7, value: 4 }]
        : [{ authorId: 7, count_0: 2, count_1: 4 }];
    } } as unknown as DbTransaction;
    const result = await getAchievementMechanic(code)!.evaluateBatch({ tx, authorIds: [7], instances: [
      { achievementId: 1, params: { tagId: 23 } },
      { achievementId: 2, params: { tagId: 24 } },
      { achievementId: 3, params: { tagId: 23 } },
    ] });
    assert.deepEqual(result.sort((a,b) => a.achievementId-b.achievementId), [
      { achievementId: 1, authorId: 7, value: 2 },
      { achievementId: 2, authorId: 7, value: 4 },
      { achievementId: 3, authorId: 7, value: 2 },
    ]);
    assert.equal(compiled.params.filter((value) => value === 23).length, 1);
    assert.equal(compiled.params.filter((value) => value === 24).length, 1);
  }
});
