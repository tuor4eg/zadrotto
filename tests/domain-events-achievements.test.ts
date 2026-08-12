import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  achievementRegistry,
  getAchievementDefinitionsForEvent,
} from "../src/lib/achievements/catalog";

const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const migrationSource = readFileSync("drizzle/0060_domain_events_achievements.sql", "utf8");
const transactionSource = readFileSync("src/db/transaction.ts", "utf8");
const dispatcherSource = readFileSync("src/lib/domain-events/dispatcher.ts", "utf8");
const ratingSource = readFileSync("src/db/queries/ratings.ts", "utf8");
const reviewSource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");
const friendsSource = readFileSync("src/db/queries/friends.ts", "utf8");
const mediaSource = readFileSync("src/db/queries/media-items.ts", "utf8");
const achievementServiceSource = readFileSync("src/lib/achievements/service.ts", "utf8");
const backfillSource = readFileSync("src/lib/achievements/backfill.ts", "utf8");
const achievementQuerySource = readFileSync("src/db/queries/achievements.ts", "utf8");
const achievementImageSource = readFileSync("src/lib/achievements/images.ts", "utf8");
const achievementAdminActionSource = readFileSync(
  "src/app/admin/(protected)/achievements/actions.ts",
  "utf8",
);
const achievementImageRouteSource = readFileSync(
  "src/app/achievement-images/[...objectKey]/route.ts",
  "utf8",
);
const achievementImagePickerSource = readFileSync(
  "src/components/achievements/achievement-image-picker.tsx",
  "utf8",
);
const toastHostSource = readFileSync(
  "src/components/achievements/achievement-toast-host.tsx",
  "utf8",
);

describe("domain event foundation", () => {
  it("stores immutable facts, a transactional outbox, and idempotent consumptions", () => {
    assert.match(schemaSource, /export const domainEvents = pgTable/);
    assert.match(schemaSource, /export const domainEventOutbox = pgTable/);
    assert.match(schemaSource, /export const domainEventConsumptions = pgTable/);
    assert.match(migrationSource, /domain_event_outbox_pending_idx[\s\S]*dispatched_at" is null/);
    assert.match(
      migrationSource,
      /PRIMARY KEY\("event_id","consumer_key"\)/,
    );
    assert.match(dispatcherSource, /onConflictDoNothing\(\)[\s\S]*consumer\.handle\(tx, typedEvent\)/);
  });

  it("commits event and outbox before best-effort immediate delivery", () => {
    assert.match(
      transactionSource,
      /const result = await db\.transaction[\s\S]*await Promise\.all\(eventIds\.map\(enqueueDomainEventDispatch\)\)/,
    );
    assert.match(migrationSource, /'domain-events-recovery'[\s\S]*'\* \* \* \* \*'/);
  });

  it("emits events from the same database transaction as each business transition", () => {
    assert.match(ratingSource, /runInDomainEventTransaction[\s\S]*type: "rating\.created"/);
    assert.match(reviewSource, /runInDomainEventTransaction[\s\S]*type: "review\.published"/);
    assert.match(friendsSource, /runInDomainEventTransaction[\s\S]*type: "friend\.accepted"/);
    assert.match(mediaSource, /runInDomainEventTransaction[\s\S]*type: "media\.published"/);
    assert.match(ratingSource, /if \(!existingRating\)/);
  });
});

describe("achievement consumer", () => {
  it("keeps five code-defined conditions and routes only relevant events", () => {
    assert.equal(achievementRegistry.length, 5);
    assert.deepEqual(
      getAchievementDefinitionsForEvent("review.published").map(({ code }) => code),
      ["first-published-review"],
    );
    assert.deepEqual(
      getAchievementDefinitionsForEvent("rating.created").map(({ code }) => code),
      ["first-rating", "ratings-10", "games-rated-10", "films-rated-10"],
    );
  });

  it("checks current published data and awards with a database uniqueness guard", () => {
    assert.match(achievementServiceSource, /eq\(mediaItems\.publicationStatus, "published"\)/);
    assert.match(achievementServiceSource, /eq\(contributions\.status, "published"\)/);
    assert.match(achievementServiceSource, /eq\(achievements\.enabled, true\)/);
    assert.match(
      achievementServiceSource,
      /onConflictDoNothing\(\{[\s\S]*userAchievements\.authorId[\s\S]*userAchievements\.achievementId/,
    );
  });

  it("preserves one award group across backfill continuation jobs", () => {
    assert.match(backfillSource, /const awardGroupId = input\.awardGroupId \?\? randomUUID\(\)/);
    assert.match(backfillSource, /afterAuthorId: lastAuthorId,[\s\S]*awardGroupId,[\s\S]*batchSize/);
  });

  it("polls only authenticated non-admin sessions and accepts at-most-once toast delivery", () => {
    assert.match(toastHostSource, /const POLL_INTERVAL_MS = 30_000/);
    assert.match(toastHostSource, /if \(authenticatedRef\.current\)/);
    assert.match(toastHostSource, /document\.visibilityState !== "visible"/);
    assert.match(toastHostSource, /pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)/);
    assert.match(toastHostSource, /if \(isAdminRoute\) return;/);
  });

  it("keeps secret achievements hidden only until they are awarded", () => {
    assert.match(schemaSource, /showWhenLocked: boolean\("show_when_locked"\)\.default\(true\)\.notNull\(\)/);
    assert.match(achievementQuerySource, /isNotNull\(userAchievements\.id\)[\s\S]*eq\(achievements\.enabled, true\)[\s\S]*eq\(achievements\.showWhenLocked, true\)/);
  });

  it("normalizes images and safely replaces assigned objects", () => {
    assert.match(achievementImageSource, /achievements\/\$\{achievementId\}\/\$\{randomUUID\(\)\}\.webp/);
    assert.match(achievementImageSource, /resize\(OUTPUT_SIZE, OUTPUT_SIZE, \{ fit: "cover", position: "centre" \}\)/);
    assert.match(achievementAdminActionSource, /uploadAchievementImage[\s\S]*updateAchievementPresentation[\s\S]*deleteAchievementImageBestEffort\(achievement\.imageObjectKey\)/);
    assert.match(achievementAdminActionSource, /catch \(error\)[\s\S]*deleteAchievementImageBestEffort\(uploadedObjectKey\)/);
  });

  it("serves only assigned images through production and local paths", () => {
    assert.match(achievementImageRouteSource, /isAssignedAchievementImageObjectKey\(objectKey\)/);
    assert.match(achievementImageRouteSource, /process\.env\.NODE_ENV !== "development"[\s\S]*"X-Accel-Redirect"/);
    assert.match(achievementImageRouteSource, /fetchS3Object\(\{ objectKey \}\)/);
  });

  it("uses a styled image picker with preview, validation, and removal", () => {
    assert.match(achievementImagePickerSource, /className="sr-only"[\s\S]*name="imageFile"/);
    assert.match(achievementImagePickerSource, /buttonVariants\(\{ size: "sm" \}\)[\s\S]*Выбрать файл/);
    assert.match(achievementImagePickerSource, /URL\.createObjectURL\(file\)/);
    assert.match(achievementImagePickerSource, /Удалить изображение/);
    assert.match(achievementImagePickerSource, /name="removeImage"/);
  });
});
