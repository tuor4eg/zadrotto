import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatUploadLimitMegabytes,
  parseAuthorAccessProfileFormInput,
} from "../src/lib/author-access-profile-form";

describe("author access profile form", () => {
  it("parses rules and optional limits", () => {
    const result = parseAuthorAccessProfileFormInput({
      name: "  Доверенный автор  ",
      canPublishMediaWithoutReview: "1",
      maxDraftMediaItems: "10",
      maxDraftMediaItemsPerDay: "2",
      maxUploadMegabytes: "25",
      maxFilesPerMediaItem: "",
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.value.name, "Доверенный автор");
      assert.equal(result.value.canPublishMediaWithoutReview, true);
      assert.equal(result.value.maxDraftMediaItems, 10);
      assert.equal(result.value.maxDraftMediaItemsPerDay, 2);
      assert.equal(result.value.maxUploadBytes, 25 * 1024 * 1024);
      assert.equal(result.value.maxFilesPerMediaItem, null);
    }
  });

  it("requires a profile name", () => {
    const result = parseAuthorAccessProfileFormInput({
      name: "",
      canPublishMediaWithoutReview: "",
      maxDraftMediaItems: "",
      maxDraftMediaItemsPerDay: "",
      maxUploadMegabytes: "",
      maxFilesPerMediaItem: "",
    });

    assert.deepEqual(result, { ok: false, error: "required" });
  });

  it("rejects zero, negative and decimal limits", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        name: "Обычный",
        canPublishMediaWithoutReview: "",
        maxDraftMediaItems: "0",
        maxDraftMediaItemsPerDay: "",
        maxUploadMegabytes: "",
        maxFilesPerMediaItem: "",
      }).ok,
      false,
    );
    assert.equal(
      parseAuthorAccessProfileFormInput({
        name: "Обычный",
        canPublishMediaWithoutReview: "",
        maxDraftMediaItems: "",
        maxDraftMediaItemsPerDay: "",
        maxUploadMegabytes: "1.5",
        maxFilesPerMediaItem: "",
      }).ok,
      false,
    );
  });

  it("rejects daily draft limits that are too large to store safely", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        name: "Обычный",
        canPublishMediaWithoutReview: "",
        maxDraftMediaItems: "",
        maxDraftMediaItemsPerDay: String(Number.MAX_SAFE_INTEGER + 1),
        maxUploadMegabytes: "",
        maxFilesPerMediaItem: "",
      }).ok,
      false,
    );
  });

  it("rejects daily draft limits that are not positive integers", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        name: "Обычный",
        canPublishMediaWithoutReview: "",
        maxDraftMediaItems: "",
        maxDraftMediaItemsPerDay: "0",
        maxUploadMegabytes: "",
        maxFilesPerMediaItem: "",
      }).ok,
      false,
    );
  });

  it("rejects upload limits that are too large to store safely", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        name: "Обычный",
        canPublishMediaWithoutReview: "",
        maxDraftMediaItems: "",
        maxDraftMediaItemsPerDay: "",
        maxUploadMegabytes: String(Number.MAX_SAFE_INTEGER),
        maxFilesPerMediaItem: "",
      }).ok,
      false,
    );
  });

  it("formats upload byte limits as megabytes", () => {
    assert.equal(formatUploadLimitMegabytes(null), "");
    assert.equal(formatUploadLimitMegabytes(15 * 1024 * 1024), "15");
  });
});
