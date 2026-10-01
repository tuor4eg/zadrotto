import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatAutomoderationReviewMessage,
  getAutomoderationReasonLabel,
} from "../src/lib/automoderation/model";

const read = (path: string) => readFileSync(path, "utf8");

describe("media automoderation contracts", () => {
  const migration = read("drizzle/0095_media_automoderation.sql");
  const consumer = read("src/lib/automoderation/consumer.ts");
  const policy = read("src/lib/automoderation/media-policy.ts");
  const process = read("src/lib/automoderation/process.ts");
  const mediaQueries = read("src/db/queries/media-items.ts");
  const notifications = read("src/lib/notifications/catalog.ts");

  it("stores one idempotent check per submitted revision and one active job", () => {
    assert.match(migration, /UNIQUE INDEX "automoderation_checks_source_event_unique"/);
    assert.match(migration, /UNIQUE INDEX "automoderation_checks_subject_revision_unique"/);
    assert.match(migration, /job_runs_automoderation_active_unique/);
    assert.match(consumer, /eventTypes: \["media\.submitted"\]/);
    assert.match(consumer, /onConflictDoNothing\(\)/);
  });

  it("fails closed for changed fields, user aliases, duplicates, and new series", () => {
    for (const reason of [
      "description_changed",
      "new_or_unpublished_franchise",
      "published_duplicate_candidate",
      "title_changed",
      "user_aliases_present",
    ]) assert.match(policy, new RegExp(reason));
    assert.match(policy, /franchises\.publicationStatus[^]*!== "published"/);
  });

  it("allows existing published series but rechecks them in the approval transaction", () => {
    assert.match(policy, /not exists \([^]*franchises\.publicationStatus[^]*<> 'published'/);
    assert.doesNotMatch(policy, /franchiseRows\.length > 0[^]*NEEDS_REVIEW/);
  });

  it("accepts a signed provider cover even when it came from another provider", () => {
    assert.match(
      policy,
      /item\.coverUrl && \([\s\S]*!isMediaProviderCode\(item\.coverSourceProvider\)[\s\S]*!item\.coverSourceExternalId\?\.trim\(\)/,
    );
    assert.doesNotMatch(policy, /item\.coverSourceProvider !== snapshot\.providerCode/);
    assert.doesNotMatch(policy, /item\.coverSourceExternalId !== snapshot\.externalId/);
    assert.equal(
      getAutomoderationReasonLabel("unverified_cover"),
      "обложка загружена вручную, а не выбрана у провайдера",
    );
  });

  it("deletes temporary provider snapshots after either approval path", () => {
    assert.match(policy, /delete\(mediaItemProviderSnapshots\)/);
    assert.match(mediaQueries, /item\.publicationStatus === "published"[^]*delete\(mediaItemProviderSnapshots\)/);
  });

  it("notifies administrators about auto-approved public records", () => {
    assert.match(notifications, /"automoderation\.approved": "Запись одобрена автоматически"/);
    assert.match(notifications, /type === "automoderation\.approved"\) return "admin"/);
    assert.match(notifications, /case "automoderation\.approved":[^]*`\/media\/\$\{input\.mediaItemCode\}`/);
  });

  it("writes readable approval outcomes and failure reasons to the activity journal", () => {
    assert.match(process, /media-auto-moderation\.approved/);
    assert.match(process, /formatAutomoderationReviewMessage\(result\.reasonCodes\)/);
    assert.match(process, /record_changed_during_check/);
    assert.equal(
      formatAutomoderationReviewMessage(["description_changed", "published_duplicate_candidate"]),
      "Автоодобрение не выполнено: описание отличается от данных провайдера; найден возможный опубликованный дубликат.",
    );
    assert.equal(
      getAutomoderationReasonLabel("provider_provider-rate-limit"),
      "ошибка проверки у провайдера (provider-rate-limit)",
    );
  });
});
