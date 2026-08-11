import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const authorActionsSource = readFileSync("src/app/author/(protected)/media/actions.ts", "utf8");
const authorFormSource = readFileSync(
  "src/app/author/(protected)/media/media-item-form.tsx",
  "utf8",
);
const authorMediaOperationsSource = readFileSync(
  "src/db/operations/author-media-items.ts",
  "utf8",
);
const coverThumbQueriesSource = readFileSync("src/db/queries/cover-thumbs.ts", "utf8");
const handlersSource = readFileSync("src/lib/jobs/handlers.ts", "utf8");
const thumbnailBackfillSource = readFileSync("src/lib/covers/thumbnail-backfill.ts", "utf8");

describe("resilient author media creation", () => {
  it("persists a per-author idempotency key with a unique database constraint", () => {
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const migration = readFileSync("drizzle/0059_author_media_creation_requests.sql", "utf8");

    assert.match(schema, /authorCreationRequestId: text\("author_creation_request_id"\)/);
    assert.match(
      schema,
      /uniqueIndex\("media_items_author_creation_request_id_unique_idx"\)\.on\([\s\S]*table\.createdByAuthorId,[\s\S]*table\.authorCreationRequestId/,
    );
    assert.match(migration, /ADD COLUMN "author_creation_request_id" text/);
    assert.match(
      migration,
      /CREATE UNIQUE INDEX "media_items_author_creation_request_id_unique_idx"[\s\S]*\("created_by_author_id", "author_creation_request_id"\)/,
    );
  });

  it("reuses an existing request before limits and creates only after the cover upload", () => {
    const existingLookup = authorMediaOperationsSource.indexOf("if (existingItem)");
    const limitLookup = authorMediaOperationsSource.indexOf(
      "getAuthorPrivateMediaItemLimitUsageForExecutor",
      existingLookup,
    );
    const coverUpload = authorActionsSource.indexOf("await resolveCoverUpload(");

    assert.ok(existingLookup >= 0);
    assert.ok(limitLookup > existingLookup);
    assert.match(authorMediaOperationsSource, /if \(existingItem\) \{[\s\S]*created: false/);
    assert.match(authorActionsSource, /coverUrl: cover\.coverUrl/);
    assert.match(authorMediaOperationsSource, /publicationStatus: "private"/);
    assert.ok(coverUpload < authorActionsSource.indexOf("createAuthorPrivateMediaItemWithLimitCheck("));
  });

  it("keeps one browser request id across retries and redirects duplicate requests to the draft", () => {
    assert.match(authorFormSource, /useRef<string \| null>\(null\)/);
    assert.match(authorFormSource, /authorCreationRequestIdRef\.current \?\?= crypto\.randomUUID\(\)/);
    assert.match(
      authorFormSource,
      /formData\.set\("authorCreationRequestId", authorCreationRequestIdRef\.current\)/,
    );
    assert.match(
      authorActionsSource,
      /if \(!result\.created\) \{[\s\S]*redirect\(getExistingCreationRedirect\(result\.item\)\)/,
    );
    assert.match(
      authorActionsSource,
      /getExistingCreationRedirect[\s\S]*getSavedDraftErrorRedirect\(item\.id, "already-created"\)/,
    );
  });

  it("returns the cover error to the open form without creating a draft", () => {
    assert.match(
      authorActionsSource,
      /if \(!cover\.ok\) \{[\s\S]*stage: "original-upload"[\s\S]*return \{ error: cover\.error \}/,
    );
    assert.match(
      authorFormSource,
      /const \[actionState, formAction, isSubmitting\] = useActionState\([\s\S]*result\?\.error/,
    );
  });

  it("logs thumbnail failure and enqueues item recovery without blocking creation", () => {
    const thumbnailFailure = authorActionsSource.indexOf("if (cover.coverUrl && cover.thumbnailError)");
    const nextRevalidation = authorActionsSource.indexOf('revalidatePath("/author/media")', thumbnailFailure);

    assert.ok(thumbnailFailure >= 0);
    assert.ok(nextRevalidation > thumbnailFailure);
    assert.match(
      authorActionsSource.slice(thumbnailFailure, nextRevalidation),
      /action: "media\.cover-thumbnail\.failed"[\s\S]*stage: "thumbnail"[\s\S]*payload: \{ mediaItemId: result\.item\.id \}[\s\S]*type: "media\.cover-thumbnails-backfill"/,
    );
  });
});

describe("cover thumbnail recovery job", () => {
  it("registers a retryable handler with validated item and batch payloads", () => {
    assert.match(handlersSource, /type: "media\.cover-thumbnails-backfill"/);
    assert.match(handlersSource, /key !== "limit" && key !== "mediaItemId"/);
    assert.match(handlersSource, /limit < 1 \|\| limit > 200/);
    assert.match(handlersSource, /mediaItemId < 1/);
    assert.match(handlersSource, /defaultMaxAttempts: 3/);
    assert.match(handlersSource, /defaultTimeoutSeconds: 300/);
    assert.match(handlersSource, /backfillCoverThumbnails\(\{ attempt, runId, \.\.\.payload \}\)/);
    assert.match(handlersSource, /cover-thumbnail-backfill-failed/);
  });

  it("defaults to 50 records, logs failures, and records successful recovery", () => {
    assert.match(thumbnailBackfillSource, /input\.mediaItemId \? 1 : input\.limit \?\? 50/);
    assert.match(thumbnailBackfillSource, /action: "media\.cover-thumbnail\.failed"/);
    assert.match(thumbnailBackfillSource, /console\.error\("cover thumbnail backfill failed"/);
    assert.match(thumbnailBackfillSource, /action: "media\.cover-thumbnail\.recovered"/);
  });

  it("selects only local missing thumbnails and uses compare-and-set when updating", () => {
    assert.match(coverThumbQueriesSource, /isNotNull\(mediaItems\.coverUrl\)/);
    assert.match(coverThumbQueriesSource, /isNull\(mediaItems\.coverThumbUrl\)/);
    assert.match(coverThumbQueriesSource, /notIlike\(mediaItems\.coverUrl, "http%"\)/);
    assert.match(coverThumbQueriesSource, /eq\(mediaItems\.id, input\.mediaItemId\)/);
    assert.match(coverThumbQueriesSource, /eq\(mediaItems\.coverUrl, input\.expectedCoverUrl\)/);
    assert.match(coverThumbQueriesSource, /coverThumbAttemptedAt\} asc nulls first/);
    assert.match(thumbnailBackfillSource, /markMediaItemCoverThumbAttempt\(/);
    assert.match(
      coverThumbQueriesSource,
      /eq\(mediaItems\.coverUrl, input\.expectedCoverUrl\),[\s\S]*isNull\(mediaItems\.coverThumbUrl\)/,
    );
    assert.match(
      thumbnailBackfillSource,
      /isMediaItemCoverThumbReferenced\([\s\S]*if \(!isReferenced\) \{[\s\S]*deleteUploadedCoverIfNeeded/,
    );
  });

  it("passes complete S3 configuration only to the jobs worker", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    const worker = compose.slice(compose.indexOf("  jobs-worker:"), compose.indexOf("\n  redis:"));
    const scheduler = compose.slice(
      compose.indexOf("  jobs-scheduler:"),
      compose.indexOf("\n  jobs-worker:"),
    );

    for (const variable of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_FORCE_PATH_STYLE",
      "S3_PUBLIC_BASE_URL",
    ]) {
      assert.match(worker, new RegExp(`${variable}:`));
      assert.doesNotMatch(scheduler, new RegExp(`${variable}:`));
    }
  });

  it("seeds an enabled daily thumbnail recovery schedule", () => {
    const migration = readFileSync("drizzle/0059_author_media_creation_requests.sql", "utf8");

    assert.match(
      migration,
      /'cover-thumbnails-backfill',[\s\S]*'media\.cover-thumbnails-backfill',[\s\S]*'\{"limit":50\}'::jsonb,[\s\S]*'30 3 \* \* \*',[\s\S]*true/,
    );
    assert.match(migration, /ON CONFLICT \("code"\) DO NOTHING/);
  });
});
