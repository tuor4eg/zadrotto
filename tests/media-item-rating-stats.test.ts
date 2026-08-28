import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync("drizzle/0079_media_item_rating_stats.sql", "utf8");
const querySource = readFileSync("src/db/queries/media-item-rating-stats.ts", "utf8");
const handlerSource = readFileSync("src/lib/jobs/handlers.ts", "utf8");

describe("media item rating statistics projection", () => {
  it("backfills and verifies the constrained projection before migration commit", () => {
    assert.match(migrationSource, /LOCK TABLE "ratings" IN SHARE ROW EXCLUSIVE MODE/);
    assert.match(migrationSource, /CHECK \("ratings_count" >= 1\)/);
    assert.match(migrationSource, /"score_sum" BETWEEN "ratings_count" \* 10 AND "ratings_count" \* 100/);
    assert.match(migrationSource, /SELECT "media_item_id", count\(\*\)::integer, sum\("score"\)::integer[\s\S]*GROUP BY "media_item_id"/);
    assert.match(migrationSource, /RAISE EXCEPTION 'media_item_rating_stats backfill verification failed'/);
  });

  it("updates sums atomically and removes the projection after the last rating", () => {
    assert.match(migrationSource, /pg_advisory_xact_lock/);
    assert.match(migrationSource, /"ratings_count" = "media_item_rating_stats"\."ratings_count" \+ 1/);
    assert.match(migrationSource, /"score_sum" = "score_sum" \+ NEW\.score - OLD\.score/);
    assert.match(migrationSource, /DELETE FROM "media_item_rating_stats"[\s\S]*"ratings_count" = 1/);
    assert.match(migrationSource, /AFTER INSERT OR UPDATE OF "media_item_id", "score" OR DELETE ON "ratings"/);
  });

  it("provides rating, average and quality-pool indexes", () => {
    assert.match(migrationSource, /media_item_rating_stats_ratings_count_idx/);
    assert.match(migrationSource, /media_item_rating_stats_average_score_idx/);
    assert.match(migrationSource, /media_item_rating_stats_quality_media_item_idx[\s\S]*"score_sum" >= "ratings_count" \* 70/);
  });

  it("reconciles batches under per-record locks and queues a continuation", () => {
    assert.match(querySource, /reconcileMediaItemRatingStatsBatch/);
    assert.match(querySource, /pg_advisory_xact_lock\(73001, locked\.media_item_id\)/);
    assert.doesNotMatch(
      querySource.slice(querySource.indexOf("reconcileMediaItemRatingStatsBatch")),
      /LOCK TABLE \$\{ratings\}/,
    );
    assert.match(querySource, /afterMediaItemId: result\.lastMediaItemId/);
    assert.match(querySource, /type: "media\.rating-stats-reconcile"/);
    assert.match(handlerSource, /batchSize[\s\S]*Размер батча должен быть от 1 до 500/);
  });

  it("seeds the daily 04:00 Moscow reconciliation schedule", () => {
    assert.match(migrationSource, /'media-item-rating-stats-reconciliation'/);
    assert.match(migrationSource, /'media\.rating-stats-reconcile'/);
    assert.match(migrationSource, /'0 1 \* \* \*'/);
  });
});
