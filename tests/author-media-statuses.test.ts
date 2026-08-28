import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AUTHOR_MEDIA_STATUSES,
  isAuthorMediaStatus,
} from "../src/lib/media/author-media-status";

const migration = readFileSync("drizzle/0048_author_media_statuses.sql", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const statusQueries = readFileSync("src/db/queries/author-media-statuses.ts", "utf8");
const ratingQueries = readFileSync("src/db/queries/ratings.ts", "utf8");
const mediaItemQueries = readFileSync("src/db/queries/media-items.ts", "utf8");
const action = readFileSync("src/app/media-status/actions.ts", "utf8");
const controls = readFileSync("src/app/author-media-status-controls.tsx", "utf8");
const catalogPreview = readFileSync("src/app/media-catalog-preview.tsx", "utf8");
const mediaItemPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const mediaItemTile = readFileSync("src/app/media-item-tile.tsx", "utf8");
const mediaItemStatusTile = readFileSync("src/app/media-item-status-tile.tsx", "utf8");

describe("author media status values", () => {
  it("accepts only the two supported statuses", () => {
    assert.deepEqual(AUTHOR_MEDIA_STATUSES, ["wanted", "skipped"]);
    assert.equal(isAuthorMediaStatus("wanted"), true);
    assert.equal(isAuthorMediaStatus("skipped"), true);
    assert.equal(isAuthorMediaStatus("rated"), false);
    assert.equal(isAuthorMediaStatus(""), false);
  });
});

describe("author media status persistence contracts", () => {
  it("enforces one valid status per author and media item with cascade cleanup", () => {
    assert.match(migration, /UNIQUE\("author_id","media_item_id"\)/);
    assert.match(migration, /CHECK \("author_media_statuses"\."status" in \('wanted', 'skipped'\)\)/);
    assert.equal((migration.match(/ON DELETE cascade/g) ?? []).length, 2);
    assert.match(migration, /\("author_id","status"\)/);
    assert.match(migration, /\("media_item_id"\)/);
    assert.match(schema, /unique\("author_media_statuses_author_media_unique"\)/);
    assert.match(schema, /check\([\s\S]*AUTHOR_MEDIA_STATUSES/);
  });

  it("serializes status and rating mutations and removes status before saving a rating", () => {
    assert.match(statusQueries, /pg_advisory_xact_lock/);
    assert.match(statusQueries, /if \(rating\)[\s\S]*throw new AuthorMediaStatusConflictError/);
    assert.match(statusQueries, /current\?\.status === input\.status[\s\S]*\.delete\(authorMediaStatuses\)/);
    assert.match(statusQueries, /onConflictDoUpdate\([\s\S]*status: input\.status/);
    assert.match(statusQueries, /setAuthorMediaStatus[\s\S]*onConflictDoUpdate/);

    const lockIndex = ratingQueries.indexOf("lockAuthorMediaState(tx, input)");
    const statusDeleteIndex = ratingQueries.indexOf(".delete(authorMediaStatuses)");
    const ratingWriteIndex = ratingQueries.indexOf(".insert(ratings)");
    assert.ok(lockIndex >= 0);
    assert.ok(statusDeleteIndex > lockIndex);
    assert.ok(ratingWriteIndex > statusDeleteIndex);
  });

  it("selects and filters statuses only for the current author", () => {
    assert.match(mediaItemQueries, /currentAuthorStatusSql\(currentAuthorId\)/);
    assert.match(mediaItemQueries, /authorMediaStatuses\.authorId} = \$\{currentAuthorId}/);
    assert.match(mediaItemQueries, /currentAuthorStatusCondition\(input\.currentAuthorId, input\.authorRatingFilter\)/);
    assert.match(mediaItemQueries, /not\(ratingExistsCondition\)[\s\S]*not\(exists\([\s\S]*authorMediaStatuses/);
  });
});

describe("author media status action and controls", () => {
  it("validates requests, reports conflicts in Russian, and revalidates related pages", () => {
    assert.match(action, /isAuthorMediaStatus\(status\)/);
    assert.match(action, /Неизвестный статус записи/);
    assert.match(action, /Статус доступен только для записи без вашей оценки/);
    assert.match(action, /revalidatePath\("\/"\)/);
    assert.match(action, /revalidatePath\(`\/media\/\$\{mediaItem\.code\}`\)/);
    assert.match(action, /revalidatePath\(`\/series\/\$\{franchise\.code\}`\)/);
  });

  it("renders both toggle values and disables them when an author rating exists", () => {
    assert.match(controls, /activeLabel: "Убрать из желаемого"/);
    assert.match(controls, /activeLabel: "Отменить пропуск"/);
    assert.match(controls, /currentAuthorScore !== null \|\| pending/);
    assert.match(controls, /const actionLabel = active \? activeLabel : label/);
    assert.match(
      controls,
      /<ArchiveTooltip[\s\S]*?label=\{actionLabel\}[\s\S]*?side="bottom">/,
    );
    assert.match(controls, /variant\?: "detail" \| "preview" \| "tile"/);
    assert.match(controls, /variant === "preview" \? "grid grid-cols-2 gap-2"/);
    assert.match(controls, /aria-label=\{actionLabel\}/);
    assert.match(controls, /aria-pressed=\{active\}/);
    assert.match(catalogPreview, /currentAuthor && item\.currentAuthorScore === null/);
    assert.match(
      mediaItemPage,
      /titleActions=\{\s*currentAuthor && item\.currentAuthorScore === null/,
    );
    assert.doesNotMatch(mediaItemTile, /AuthorMediaStatusControls/);
    assert.match(mediaItemStatusTile, /const showStatusActions = currentAuthorScore === null/);
    assert.match(
      mediaItemStatusTile,
      /xl:group-hover:pointer-events-auto xl:group-hover:opacity-100/,
    );
    assert.match(mediaItemStatusTile, /event\.clientX - pointerStartX\.current < -40/);
    assert.match(
      mediaItemStatusTile,
      /event\.pointerType === "mouse" && window\.matchMedia\("\(min-width: 1280px\)"\)\.matches/,
    );
    assert.match(mediaItemStatusTile, /event\.preventDefault\(\);\s*event\.stopPropagation\(\)/);
    assert.match(
      mediaItemStatusTile,
      /group relative aspect-\[2\/3\][^"\n]*touch-pan-y[^"\n]*\[&>button\]:h-full/,
    );
    assert.match(
      mediaItemStatusTile,
      /<MediaItemTile[\s\S]*<AuthorMediaStatusControls/,
    );
  });
});
