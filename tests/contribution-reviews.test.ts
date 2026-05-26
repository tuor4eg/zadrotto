import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  parseReviewFormInput,
  REVIEW_BODY_MAX_LENGTH,
} from "../src/lib/contribution-review-form";
import {
  isAdminReviewableContributionStatus,
  isAuthorEditableContributionStatus,
} from "../src/lib/contributions";

describe("parseReviewFormInput", () => {
  it("trims plain review text input", () => {
    const result = parseReviewFormInput({
      title: "  Хороший текст  ",
      body: "  Рецензия с нормальной длиной текста.  ",
    });

    assert.deepEqual(result, {
      ok: true,
      value: {
        title: "Хороший текст",
        body: "Рецензия с нормальной длиной текста.",
      },
    });
  });

  it("rejects empty, short, and too long review content", () => {
    assert.deepEqual(parseReviewFormInput({ title: "", body: "" }), {
      ok: false,
      error: "required",
    });
    assert.deepEqual(parseReviewFormInput({ title: "Заголовок", body: "Коротко" }), {
      ok: false,
      error: "body-too-short",
    });
    assert.deepEqual(
      parseReviewFormInput({
        title: "Заголовок",
        body: "x".repeat(REVIEW_BODY_MAX_LENGTH + 1),
      }),
      {
        ok: false,
        error: "body-too-long",
      },
    );
  });
});

describe("contribution status rules", () => {
  it("keeps submitted reviews locked for authors and reviewable by admins", () => {
    assert.equal(isAuthorEditableContributionStatus("draft"), true);
    assert.equal(isAuthorEditableContributionStatus("published"), true);
    assert.equal(isAuthorEditableContributionStatus("rejected"), true);
    assert.equal(isAuthorEditableContributionStatus("hidden"), true);
    assert.equal(isAuthorEditableContributionStatus("submitted"), false);

    assert.equal(isAdminReviewableContributionStatus("submitted"), true);
    assert.equal(isAdminReviewableContributionStatus("published"), true);
    assert.equal(isAdminReviewableContributionStatus("draft"), false);
  });
});

describe("author contribution migration", () => {
  it("enforces one review per author and primary media item", () => {
    const migration = readFileSync("drizzle/0008_author_contributions.sql", "utf8");

    assert.match(migration, /CREATE UNIQUE INDEX "contributions_review_author_media_unique"/);
    assert.match(migration, /"author_id","primary_media_item_id"/);
    assert.match(migration, /WHERE "contributions"\."type" = 'review'/);
  });
});
