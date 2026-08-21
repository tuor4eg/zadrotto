import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  achievementMechanicRegistry,
  getAchievementMechanic,
} from "../src/lib/achievements/catalog";

const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const migrationSource = readFileSync("drizzle/0060_domain_events_achievements.sql", "utf8");
const mechanicsMigrationSource = readFileSync("drizzle/0065_achievement_mechanics_levels.sql", "utf8");
const transactionSource = readFileSync("src/db/transaction.ts", "utf8");
const dispatcherSource = readFileSync("src/lib/domain-events/dispatcher.ts", "utf8");
const ratingSource = readFileSync("src/db/queries/ratings.ts", "utf8");
const reviewSource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");
const friendsSource = readFileSync("src/db/queries/friends.ts", "utf8");
const mediaSource = readFileSync("src/db/queries/media-items.ts", "utf8");
const franchiseSource = readFileSync("src/db/queries/franchises.ts", "utf8");
const achievementConsumerSource = readFileSync("src/lib/achievements/consumer.ts", "utf8");
const achievementServiceSource = readFileSync("src/lib/achievements/service.ts", "utf8");
const backfillSource = readFileSync("src/lib/achievements/backfill.ts", "utf8");
const achievementQuerySource = readFileSync("src/db/queries/achievements.ts", "utf8");
const achievementImageSource = readFileSync("src/lib/achievements/images.ts", "utf8");
const achievementAdminActionSource = readFileSync(
  "src/app/admin/(protected)/achievements/actions.ts",
  "utf8",
);
const achievementNewPageSource = readFileSync(
  "src/app/admin/(protected)/achievements/new/page.tsx",
  "utf8",
);
const achievementConfigurationSource = readFileSync(
  "src/app/admin/(protected)/achievements/achievement-configuration-fields.tsx",
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
const archiveToastsSource = readFileSync("src/components/ui/archive-toasts.tsx", "utf8");

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
    assert.match(dispatcherSource, /if \(!claimed \|\| !consumer\.afterCommit\) continue/);
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
    assert.match(franchiseSource, /runInDomainEventTransaction[\s\S]*type: "media-franchise\.published"/);
    assert.match(franchiseSource, /type: "franchise\.parent\.changed"/);
    assert.match(ratingSource, /if \(!existingRating\)/);
  });
});

describe("achievement consumer", () => {
  it("registers reusable mechanics with independently declared parameters", () => {
    assert.equal(achievementMechanicRegistry.length, 5);
    const rating = getAchievementMechanic("rating.authored.count");
    const review = getAchievementMechanic("review.authored.count");
    const media = getAchievementMechanic("media.authored.count");
    const quizCorrect = getAchievementMechanic("quiz.correct.count");
    const quizWin = getAchievementMechanic("quiz.win.count");
    assert.deepEqual(rating?.params.map(({ code }) => code), ["mediaType", "seriesId"]);
    assert.deepEqual(review?.params.map(({ code }) => code), ["mediaType", "seriesId"]);
    assert.deepEqual(media?.params.map(({ code }) => code), ["mediaType", "seriesId"]);
    assert.deepEqual(quizCorrect?.params, []);
    assert.deepEqual(quizWin?.params, []);
    assert.notEqual(rating?.params, review?.params);
    assert.notEqual(review?.params, media?.params);
    assert.deepEqual(review?.eventTypes, [
      "review.published", "media.published", "media-franchise.published", "franchise.parent.changed",
    ]);
    assert.deepEqual(media?.eventTypes, [
      "media.published", "media-franchise.published", "franchise.parent.changed",
    ]);
    assert.deepEqual(rating?.parseParams({ mediaType: "film", seriesId: 42 }), {
      mediaType: "film",
      seriesId: 42,
    });
    assert.deepEqual(media?.parseParams({ mediaType: "game" }), { mediaType: "game" });
    assert.throws(() => rating?.parseParams({ mediaType: "film", unsupported: true }));
    assert.throws(() => review?.parseParams({ seriesId: 0 }));
    assert.throws(() => media?.parseParams({ seriesId: 0 }));
    assert.deepEqual(quizCorrect?.parseParams({}), {});
    assert.deepEqual(quizWin?.parseParams({}), {});
    assert.throws(() => quizCorrect?.parseParams({ mediaType: "film" }));
    assert.throws(() => quizWin?.parseParams(null));
    assert.deepEqual(quizCorrect?.eventTypes, ["quiz.completed"]);
    assert.deepEqual(quizWin?.eventTypes, ["quiz.completed"]);
  });

  it("evaluates quiz mechanics set-wise and routes completion to its author", () => {
    const catalogSource = readFileSync("src/lib/achievements/catalog.ts", "utf8");
    assert.match(catalogSource, /from \$\{quizParticipants\}[\s\S]*authorId} in \(\$\{sql\.join\(input\.authorIds/);
    assert.match(catalogSource, /quizParticipants\.outcome} = 'correct'/);
    assert.match(catalogSource, /quizParticipants\.isWinner} = true/);
    assert.match(catalogSource, /group by \$\{quizParticipants\.authorId\}/);
    assert.doesNotMatch(catalogSource, /for \(const authorId of input\.authorIds\)/);
    assert.match(achievementConsumerSource, /"quiz\.completed"/);
    assert.match(achievementConsumerSource, /event\.type === "quiz\.completed"[\s\S]*authorId/);
  });

  it("checks current published data and awards with a database uniqueness guard", () => {
    assert.match(readFileSync("src/lib/achievements/catalog.ts", "utf8"), /publicationStatus} = 'published'/);
    assert.match(achievementConsumerSource, /mediaItems\.createdByAuthorId/);
    assert.match(
      achievementConsumerSource,
      /select \$\{mediaItems\.createdByAuthorId\} as author_id from \$\{mediaItems\}/,
    );
    assert.match(achievementServiceSource, /eq\(achievements\.enabled, true\)/);
    assert.match(
      achievementServiceSource,
      /onConflictDoNothing\(\{[\s\S]*userAchievements\.authorId[\s\S]*userAchievements\.achievementLevelId/,
    );
    assert.match(mechanicsMigrationSource, /Legacy user achievement has no unambiguous achievement level/);
    assert.match(mechanicsMigrationSource, /Achievement has no mechanic mapping/);
    assert.match(mechanicsMigrationSource, /DROP COLUMN "achievement_id"/);
    assert.match(mechanicsMigrationSource, /SET "achievement_level_id" = al\."id"[\s\S]*al\."achievement_id" = ua\."achievement_id"/);
    assert.match(achievementServiceSource, /\.for\("share", \{ of: achievements \}\)/);
    assert.match(achievementQuerySource, /input\.threshold <= previousLevel\.threshold/);
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
    assert.match(toastHostSource, /group\.achievements\.map\(\(achievement\) =>/);
    assert.match(toastHostSource, /imageUrl: achievement\.imageUrl/);
    assert.match(toastHostSource, /Получена ачивка «\$\{achievement\.name\}»/);
    assert.match(
      achievementQuerySource,
      /achievements: claimedAchievements\.map\(\(achievement\) =>[\s\S]*resolveAchievementImageUrl\(achievement\.levelImageObjectKey\)/,
    );
    assert.match(archiveToastsSource, /src=\{message\.imageUrl\}[\s\S]*unoptimized/);
  });

  it("keeps secret achievements hidden only until they are awarded", () => {
    assert.match(schemaSource, /showWhenLocked: boolean\("show_when_locked"\)\.default\(true\)\.notNull\(\)/);
    assert.match(achievementQuerySource, /exists \([\s\S]*awarded_level\.achievement_id = \$\{achievements\.id\}[\s\S]*eq\(achievements\.enabled, true\)[\s\S]*eq\(achievements\.showWhenLocked, true\)/);
  });

  it("keeps current progress separate from the highest historical level", () => {
    assert.match(achievementQuerySource, /currentValue: valueByAchievement\.get\(presentation\.achievementId\) \?\? 0/);
    assert.match(achievementQuerySource, /awardedLevels/);
    assert.doesNotMatch(achievementQuerySource, /Math\.max\([\s\S]*currentValue/);
  });

  it("normalizes images and safely replaces assigned objects", () => {
    assert.match(achievementImageSource, /achievements\/\$\{achievementId\}\/\$\{randomUUID\(\)\}\.webp/);
    assert.match(achievementImageSource, /resize\(OUTPUT_SIZE, OUTPUT_SIZE, \{ fit: "cover", position: "centre" \}\)/);
    assert.match(achievementAdminActionSource, /uploadAchievementImage[\s\S]*updateAchievementLevel[\s\S]*deleteAchievementImageBestEffort\(currentLevel\.imageObjectKey\)/);
    assert.match(achievementAdminActionSource, /catch \(error\)[\s\S]*deleteAchievementImageBestEffort\(imageResult\.uploadedObjectKey\)/);
  });

  it("serves only assigned images through production and local paths", () => {
    assert.match(achievementQuerySource, /achievementSettings\.lockedImageObjectKey/);
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

  it("generates a unique achievement code instead of asking the admin for one", () => {
    assert.doesNotMatch(achievementNewPageSource, /name="code"/);
    assert.match(
      achievementAdminActionSource,
      /generateEntityCode\(\{ name: configuration\.name, type: "achievement" \}\)/,
    );
  });

  it("keeps the catalog name on the achievement and images only on levels", () => {
    const presentationMigration = readFileSync("drizzle/0072_achievement_presentation_levels.sql", "utf8")
    const editPageSource = readFileSync("src/app/admin/(protected)/achievements/[id]/edit/page.tsx", "utf8")
    const levelsSource = readFileSync(
      "src/app/admin/(protected)/achievements/achievement-levels-tab.tsx",
      "utf8",
    )
    const achievementsTableSource = schemaSource.slice(
      schemaSource.indexOf("export const achievements = pgTable"),
      schemaSource.indexOf("export const achievementLevels = pgTable"),
    )
    assert.match(presentationMigration, /ALTER COLUMN "description" DROP NOT NULL/)
    assert.match(presentationMigration, /DROP COLUMN "image_object_key"/)
    assert.match(achievementsTableSource, /name: text\("name"\)\.notNull\(\)/)
    assert.match(achievementsTableSource, /description: text\("description"\),/)
    assert.doesNotMatch(achievementsTableSource, /imageObjectKey/)
    assert.match(
      schemaSource,
      /check\("achievements_description_check", sql`\$\{table\.description\} is null or btrim\(\$\{table\.description\}\) <> ''`\)/,
    )
    assert.match(achievementAdminActionSource, /if \(!name\) throw new Error\("invalid"\)/)
    assert.match(achievementAdminActionSource, /description: description \|\| null/)
    assert.match(
      achievementAdminActionSource,
      /generateEntityCode\(\{ name: configuration\.name, type: "achievement" \}\)/,
    )
    assert.doesNotMatch(achievementNewPageSource, /name="description"[^>]*required/)
    assert.doesNotMatch(editPageSource, /Базовое изображение/)
    assert.doesNotMatch(editPageSource, /AchievementImagePicker/)
    assert.match(levelsSource, /AchievementImagePicker/)
    assert.match(achievementQuerySource, /name: presentation\.levelName \?\? presentation\.name/)
    assert.match(achievementQuerySource, /description: presentation\.levelDescription \?\? presentation\.description/)
    assert.match(achievementQuerySource, /resolveAchievementImageUrl\(presentation\.levelImageObjectKey\)/)
    assert.doesNotMatch(achievementQuerySource, /achievements\.imageObjectKey/)
  })

  it("creates achievements disabled until the admin opts in", () => {
    assert.match(achievementNewPageSource, /name="enabled" value="1"/);
    assert.doesNotMatch(achievementNewPageSource, /name="enabled"[^>]*defaultChecked/);
    assert.match(
      achievementAdminActionSource,
      /if \(achievement\.enabled\) await enqueueAchievementBackfill/,
    );
  });

  it("lets the admin search published series instead of picking from a full select", () => {
    assert.match(achievementConfigurationSource, /<SearchableFranchiseSelect/);
    assert.match(achievementConfigurationSource, /emptyLabel="Без фильтра"/);
    assert.match(achievementNewPageSource, /publicationStatus === "published"/);
  });

  it("renders achievement and level lists as mobile cards and desktop tables", () => {
    const listSource = readFileSync("src/app/admin/(protected)/achievements/page.tsx", "utf8")
    const levelsSource = readFileSync(
      "src/app/admin/(protected)/achievements/achievement-levels-tab.tsx",
      "utf8",
    )
    assert.match(listSource, /grid gap-3 sm:hidden/)
    assert.match(listSource, /TableWrap className="hidden sm:block"/)
    assert.match(levelsSource, /mt-4 grid gap-3 sm:hidden/)
    assert.match(levelsSource, /TableWrap className="mt-4 hidden sm:block"/)
  });

  it("renders a 2-by-1 split achievement card and shows five recent awards in the same grid", () => {
    const cardSource = readFileSync("src/components/achievements/achievement-card.tsx", "utf8")
    const recentSource = readFileSync(
      "src/components/achievements/recent-achievement-showcase.tsx",
      "utf8",
    )
    const showcaseSource = readFileSync("src/components/achievements/achievement-showcase.tsx", "utf8")
    assert.match(cardSource, /ACHIEVEMENT_CARD_WIDTH_PX = ACHIEVEMENT_CARD_HEIGHT_PX \* 2/)
    assert.match(cardSource, /grid h-full w-full shrink-0 basis-full grid-cols-2/)
    assert.match(cardSource, /translateX\(-\$\{viewIndex \* 100\}%\)/)
    assert.match(cardSource, /transition-transform duration-300 ease-out/)
    assert.match(cardSource, /formatLevel\(/)
    assert.match(cardSource, /formatReceivedAt\(/)
    assert.match(cardSource, /browseAwardedLevels/)
    assert.match(cardSource, /onMouseLeave=\{canBrowse \? \(\) => \{/)
    assert.match(cardSource, /SWIPE_THRESHOLD_PX = 40/)
    assert.match(cardSource, /onPointerDown=\{canBrowse \? \(event\) => \{/)
    assert.match(cardSource, /if \(dx < 0\) setViewIndex\(\(index\) => Math\.min\(currentIndex, index \+ 1\)\)/)
    assert.match(recentSource, /RECENT_ACHIEVEMENT_LIMIT = 5/)
    assert.match(recentSource, /browseAwardedLevels fillWidth item=\{item\}/)
    assert.match(recentSource, /grid gap-2 sm:grid-cols-2 xl:grid-cols-5/)
    assert.match(showcaseSource, /browseAwardedLevels fillWidth item=\{item\}/)
    assert.match(showcaseSource, /grid gap-2 sm:grid-cols-2 xl:grid-cols-5/)
    assert.doesNotMatch(showcaseSource, /auto-fill/)
  })

  it("loads production achievement images in the browser instead of the image optimizer", () => {
    const cardSource = readFileSync("src/components/achievements/achievement-card.tsx", "utf8")
    const pickerSource = readFileSync(
      "src/components/achievements/achievement-image-picker.tsx",
      "utf8",
    )
    const listSource = readFileSync("src/app/admin/(protected)/achievements/page.tsx", "utf8")
    const levelsSource = readFileSync(
      "src/app/admin/(protected)/achievements/achievement-levels-tab.tsx",
      "utf8",
    )
    assert.match(cardSource, /src=\{slide\.imageUrl\}[\s\S]*unoptimized/)
    assert.match(pickerSource, /src=\{previewUrl\} unoptimized/)
    assert.match(listSource, /src=\{item\.imageUrl\} unoptimized/)
    assert.match(levelsSource, /src=\{imageUrl\} unoptimized/)
    assert.match(archiveToastsSource, /src=\{message\.imageUrl\}[\s\S]*unoptimized/)
    assert.match(achievementImageRouteSource, /"X-Accel-Redirect"/)
    assert.match(
      readFileSync("deploy/nginx/zadrotto.conf", "utf8"),
      /location \^~ \/_achievement-images\/ \{[\s\S]*?internal;[\s\S]*?proxy_pass/,
    )
  });

  it("lets the admin disable an achievement and delete it only before anyone is awarded", () => {
    const listSource = readFileSync("src/app/admin/(protected)/achievements/page.tsx", "utf8")
    const querySource = readFileSync("src/db/queries/achievements.ts", "utf8")
    const actionSource = readFileSync(
      "src/app/admin/(protected)/achievements/actions.ts",
      "utf8",
    )
    assert.match(querySource, /hasAwards: awardedIds\.has\(row\.id\)/)
    assert.match(
      querySource,
      /firstLevelImageByAchievement\.get\(row\.id\) \?\? highestLevelImageByAchievement\.get\(row\.id\) \?\? null/,
    )
    assert.match(querySource, /orderBy\(asc\(achievementLevels\.achievementId\), desc\(achievementLevels\.level\)\)/)
    assert.match(querySource, /throw new Error\("achievement-awarded"\)/)
    assert.match(actionSource, /export async function toggleAchievementAction/)
    assert.match(actionSource, /export async function deleteAchievementAction/)
    assert.match(listSource, /toggleAchievementAction/)
    assert.match(listSource, /deleteAchievementAction/)
    assert.match(listSource, /disabled=\{hasAwards\}/)
    assert.match(listSource, /Нельзя удалить: ачивку уже кто-то получил/)
  });
});
