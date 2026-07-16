import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ACTIVITY_SEVERITY_LABELS,
  formatActivityLogDate,
  getDefaultActivitySeverity,
  getActivityActionLabel,
  getActivityLogFranchises,
  getActivityEntityTypeLabel,
  getFranchiseMediaActivityContext,
  sanitizeActivityLogMetadata,
} from "@/lib/activity-logs/model";

describe("activity log metadata", () => {
  it("removes secret-like fields from metadata", () => {
    const sanitized = sanitizeActivityLogMetadata({
      login: "admin",
      password: "plain",
      accessToken: "token-value",
      sessionCookie: "cookie-value",
      providerCredentials: {
        apiKey: "secret-value",
      },
      nested: {
        safe: "value",
        encryptedPayload: "ciphertext",
      },
      changedAt: new Date("2026-06-21T12:00:00.000Z"),
    });

    assert.deepEqual(sanitized, {
      login: "admin",
      nested: {
        safe: "value",
      },
      changedAt: "2026-06-21T12:00:00.000Z",
    });
  });

  it("returns null when all metadata fields are secret", () => {
    const sanitized = sanitizeActivityLogMetadata({
      token: "token-value",
      passwordHash: "hash",
    });

    assert.equal(sanitized, null);
  });

  it("reads sanitized franchise context and ignores malformed values", () => {
    const metadata = sanitizeActivityLogMetadata({
      franchises: [
        { id: 12, title: "  Матрица  " },
        { id: 12, title: "Дубликат Матрицы" },
        { id: 0, title: "Неверная серия" },
        { id: 13, title: "" },
        null,
        "legacy-value",
      ],
    });

    assert.deepEqual(getActivityLogFranchises(metadata), [{ id: 12, title: "Матрица" }]);
    assert.deepEqual(getActivityLogFranchises({ franchises: "legacy-value" }), []);
    assert.deepEqual(getActivityLogFranchises(null), []);
  });

  it("reads canonical and legacy franchise media contexts with partial fallbacks", () => {
    assert.deepEqual(
      getFranchiseMediaActivityContext({
        action: "franchise.media.attached",
        entityId: 40,
        entityLabel: "Архивная запись",
        entityType: "media-item",
        metadata: {
          mediaItem: { id: 40, title: "Запись" },
          franchises: [
            { id: 7, title: "Серия" },
            { id: 7, title: "Дубликат" },
          ],
        },
      }),
      {
        mediaItem: { id: 40, title: "Запись" },
        franchises: [{ id: 7, title: "Серия" }],
      },
    );
    assert.deepEqual(
      getFranchiseMediaActivityContext({
        action: "franchise.media.detached",
        entityId: 7,
        entityLabel: "Серия",
        entityType: "franchise",
        metadata: { mediaItemId: 40, mediaItemTitle: "Запись" },
      }),
      {
        mediaItem: { id: 40, title: "Запись" },
        franchises: [{ id: 7, title: "Серия" }],
      },
    );
    assert.deepEqual(
      getFranchiseMediaActivityContext({
        action: "franchise.media.suggested",
        entityId: 40,
        entityLabel: "Запись",
        entityType: "media-item",
        metadata: { franchises: "malformed" },
      }),
      { mediaItem: { id: 40, title: "Запись" }, franchises: [] },
    );
    assert.deepEqual(
      getFranchiseMediaActivityContext({
        action: "franchise.media.attached",
        entityId: 7,
        entityLabel: "Серия",
        entityType: "franchise",
        metadata: {
          mediaItem: { id: "malformed", title: "" },
          mediaItemId: 40,
          mediaItemTitle: "  Legacy-запись  ",
          franchises: [{ id: 0, title: "Битая серия" }],
        },
      }),
      {
        mediaItem: { id: 40, title: "Legacy-запись" },
        franchises: [{ id: 7, title: "Серия" }],
      },
    );
    assert.equal(
      getFranchiseMediaActivityContext({
        action: "media.updated",
        entityId: 40,
        entityLabel: "Запись",
        entityType: "media-item",
        metadata: null,
      }),
      null,
    );
  });
});

describe("activity log labels", () => {
  it("returns Russian labels for known actions and entity types", () => {
    assert.equal(getActivityActionLabel("admin.login"), "Вход админа");
    assert.equal(getActivityActionLabel("review.deleted"), "Рецензия удалена");
    assert.equal(getActivityActionLabel("media.submitted"), "Запись отправлена на модерацию");
    assert.equal(getActivityActionLabel("review.created"), "Рецензия создана");
    assert.equal(getActivityActionLabel("franchise.media.attached"), "Серия добавлена к записи");
    assert.equal(getActivityActionLabel("franchise.media.suggested"), "Связь серии предложена");
    assert.equal(getActivityActionLabel("franchise-review.approved"), "Заявка серии одобрена");
    assert.equal(getActivityActionLabel("franchise-review.rejected"), "Заявка серии отклонена");
    assert.equal(getActivityEntityTypeLabel("media-item"), "Запись");
    assert.equal(ACTIVITY_SEVERITY_LABELS.critical, "Критично");
  });

  it("falls back to raw values for unknown labels", () => {
    assert.equal(getActivityActionLabel("custom.action"), "custom.action");
    assert.equal(getActivityEntityTypeLabel("custom-entity"), "custom-entity");
    assert.equal(getActivityEntityTypeLabel(null), null);
  });
});

describe("franchise media activity migration", () => {
  it("separates attached events from suggestions and removes only known boilerplate", () => {
    const actionSource = readFileSync("src/app/media/franchise-actions.ts", "utf8");
    const migration = readFileSync("drizzle/0031_normalize_franchise_media_activity.sql", "utf8");

    assert.match(
      actionSource,
      /publicationStatus === "published"[\s\S]*\? "franchise\.media\.attached"[\s\S]*: "franchise\.media\.suggested"/,
    );
    assert.doesNotMatch(actionSource, /message: publicationStatus === "published"/);
    assert.match(
      migration,
      /SET "action" = 'franchise\.media\.attached'[\s\S]*WHERE "action" = 'franchise\.media\.suggested'[\s\S]*AND "message" IN \('Серия добавлена к тайтлу\.', 'Серия добавлена к записи\.'\);/,
    );
    assert.match(
      migration,
      /SET "message" = NULL[\s\S]*WHERE "action" IN \('franchise\.media\.attached', 'franchise\.media\.suggested'\)[\s\S]*AND "message" IN \([\s\S]*'Серия добавлена к тайтлу\.',[\s\S]*'Серия добавлена к записи\.',[\s\S]*'Связь серии предложена\.'[\s\S]*\);/,
    );
    assert.match(
      migration,
      /"action" = 'franchise\.media\.attached' AND "message" = 'Запись привязана к серии\.'/,
    );
    assert.match(
      migration,
      /"action" = 'franchise\.media\.detached' AND "message" = 'Запись отвязана от серии\.'/,
    );
  });
});

describe("franchise media activity context", () => {
  it("logs affected franchises and renders safe admin links", () => {
    const actionSource = readFileSync("src/app/media/franchise-actions.ts", "utf8");
    const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
    const adminActionSource = readFileSync("src/app/admin/(protected)/franchises/actions.ts", "utf8");
    const pageSource = readFileSync("src/app/admin/(protected)/tools/activity/page.tsx", "utf8");
    const activityCallSource = actionSource.slice(actionSource.indexOf("await logActivity({"));
    const adminAttachActivitySource = adminActionSource.slice(
      adminActionSource.indexOf('action: "franchise.media.attached"'),
      adminActionSource.indexOf("?attached=1"),
    );
    const adminDetachActivitySource = adminActionSource.slice(
      adminActionSource.indexOf('action: "franchise.media.detached"'),
      adminActionSource.indexOf("?detached=1"),
    );

    assert.match(querySource, /select\(\{ id: franchises\.id, title: franchises\.title \}\)/);
    assert.match(
      querySource,
      /return franchiseIds\.map\(\(franchiseId\) => availableFranchisesById\.get\(franchiseId\)!\)/,
    );
    assert.match(actionSource, /affectedFranchises = links;/);
    assert.match(
      actionSource,
      /affectedFranchises = \[\{ id: franchise\.id, title: franchise\.title \}\];/,
    );
    assert.match(
      actionSource,
      /mediaItem: \{ id: mediaItem\.id, title: mediaItem\.title \},[\s\S]*franchises: affectedFranchises/,
    );
    assert.doesNotMatch(activityCallSource, /message:/);
    for (const adminActivitySource of [adminAttachActivitySource, adminDetachActivitySource]) {
      assert.match(
        adminActivitySource,
        /mediaItem: \{ id: item\.id, title: item\.title \},[\s\S]*franchises: \[\{ id: franchise\.id, title: franchise\.title \}\]/,
      );
    }
    assert.doesNotMatch(adminAttachActivitySource, /message:|mediaItemId:|mediaItemTitle:|franchiseIds:/);
    assert.doesNotMatch(adminDetachActivitySource, /message:|mediaItemId:|mediaItemTitle:|franchiseIds:/);
    assert.match(pageSource, /getFranchiseMediaActivityContext\(\{/);
    assert.match(pageSource, /<ActivityLogDetails item=\{item\} showPrimaryEntity \/>/);
    assert.match(pageSource, /<ActivityLogDetails item=\{item\} showPrimaryEntity=\{false\} \/>/);
    assert.match(pageSource, /showPrimaryEntity \|\| item\.entityType !== "media-item"/);
    assert.match(pageSource, /franchise\.id !== item\.entityId/);
    assert.match(pageSource, /contextFranchises\.length === 1 \? "Серия" : "Серии"/);
    assert.match(pageSource, /href=\{`\/admin\/media\/\$\{contextMediaItem\.id\}\/edit`\}/);
    assert.match(pageSource, /href=\{`\/admin\/franchises\/\$\{franchise\.id\}\/edit`\}/);
  });
});

describe("activity log date formatting", () => {
  it("formats timestamps in a provided display timezone", () => {
    const value = "2026-06-21T12:00:00.000Z";

    assert.equal(formatActivityLogDate(value, { timeZone: "UTC" }), "21.06.2026, 12:00:00");
    assert.equal(
      formatActivityLogDate(value, { timeZone: "Europe/Moscow" }),
      "21.06.2026, 15:00:00",
    );
  });

  it("returns a placeholder for invalid timestamps", () => {
    assert.equal(formatActivityLogDate("not-a-date"), "—");
  });
});

describe("activity log severity", () => {
  it("returns warning for ordinary failures", () => {
    assert.equal(
      getDefaultActivitySeverity({
        action: "admin.login.failed",
        status: "failure",
      }),
      "warning",
    );
  });

  it("returns critical for sensitive destructive or security actions", () => {
    assert.equal(
      getDefaultActivitySeverity({
        action: "admin.password.changed",
        status: "success",
      }),
      "critical",
    );
    assert.equal(
      getDefaultActivitySeverity({
        action: "author-token.deleted",
        status: "success",
      }),
      "critical",
    );
    assert.equal(
      getDefaultActivitySeverity({
        action: "review.deleted",
        status: "success",
      }),
      "critical",
    );
  });

  it("returns info for ordinary successful actions", () => {
    assert.equal(
      getDefaultActivitySeverity({
        action: "media.updated",
        status: "success",
      }),
      "info",
    );
  });
});
