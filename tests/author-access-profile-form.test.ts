import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatUploadLimitMegabytes,
  parseAuthorAccessProfileFormInput,
} from "../src/lib/forms/author-access-profile";

function profileInput(input: Partial<Parameters<typeof parseAuthorAccessProfileFormInput>[0]> = {}) {
  return {
    name: "",
    canPublishMediaWithoutReview: "",
    maxDraftMediaItems: "",
    maxDraftMediaItemsPerDay: "",
    maxUploadMegabytes: "",
    maxFilesPerMediaItem: "",
    coverSearchesPerMinute: "",
    coverSearchesPerHour: "",
    coverSearchesPerDay: "",
    ...input,
  };
}

describe("author access profile form", () => {
  it("parses rules and optional limits", () => {
    const result = parseAuthorAccessProfileFormInput(profileInput({
      name: "  Доверенный автор  ",
      canPublishMediaWithoutReview: "1",
      maxDraftMediaItems: "10",
      maxDraftMediaItemsPerDay: "2",
      maxUploadMegabytes: "25",
      maxFilesPerMediaItem: "",
      coverSearchesPerMinute: "20",
      coverSearchesPerHour: "200",
      coverSearchesPerDay: "1000",
    }));

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.value.name, "Доверенный автор");
      assert.equal(result.value.canPublishMediaWithoutReview, true);
      assert.equal(result.value.maxDraftMediaItems, 10);
      assert.equal(result.value.maxDraftMediaItemsPerDay, 2);
      assert.equal(result.value.maxUploadBytes, 25 * 1024 * 1024);
      assert.equal(result.value.maxFilesPerMediaItem, null);
      assert.equal(result.value.coverSearchesPerMinute, 20);
      assert.equal(result.value.coverSearchesPerHour, 200);
      assert.equal(result.value.coverSearchesPerDay, 1000);
    }
  });

  it("requires a profile name", () => {
    const result = parseAuthorAccessProfileFormInput(profileInput());

    assert.deepEqual(result, { ok: false, error: "required" });
  });

  it("rejects zero, negative and decimal limits", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        ...profileInput(),
        name: "Обычный",
        maxDraftMediaItems: "0",
      }).ok,
      false,
    );
    assert.equal(
      parseAuthorAccessProfileFormInput({
        ...profileInput(),
        name: "Обычный",
        maxUploadMegabytes: "1.5",
      }).ok,
      false,
    );
  });

  it("rejects daily draft limits that are too large to store safely", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        ...profileInput(),
        name: "Обычный",
        maxDraftMediaItemsPerDay: String(Number.MAX_SAFE_INTEGER + 1),
      }).ok,
      false,
    );
  });

  it("rejects daily draft limits that are not positive integers", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        ...profileInput(),
        name: "Обычный",
        maxDraftMediaItemsPerDay: "0",
      }).ok,
      false,
    );
  });

  it("rejects upload limits that are too large to store safely", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        ...profileInput(),
        name: "Обычный",
        maxUploadMegabytes: String(Number.MAX_SAFE_INTEGER),
      }).ok,
      false,
    );
  });

  it("rejects invalid cover search limits", () => {
    assert.equal(
      parseAuthorAccessProfileFormInput({
        ...profileInput(),
        name: "Обычный",
        coverSearchesPerMinute: "0",
      }).ok,
      false,
    );
  });

  it("formats upload byte limits as megabytes", () => {
    assert.equal(formatUploadLimitMegabytes(null), "");
    assert.equal(formatUploadLimitMegabytes(15 * 1024 * 1024), "15");
  });
});
