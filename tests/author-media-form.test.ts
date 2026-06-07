import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthorCoverObjectKey,
  buildAuthorMediaCode,
  getCoverFileExtension,
  isAuthorEditablePublicationStatus,
  normalizeOptionalFormString,
  parseOptionalPositiveInteger,
  parseOptionalReleaseYear,
  slugifyMediaTitle,
  validateCoverFileInput,
} from "../src/lib/forms/author-media";
import { generateEntityCode, slugifyCodePart } from "../src/lib/common/generated-code";
import {
  parseRequiredMediaCarrierId,
  validateMediaCarrierForMediaType,
} from "../src/lib/forms/media-carrier";

describe("author media form helpers", () => {
  it("normalizes optional strings to null when empty", () => {
    assert.equal(normalizeOptionalFormString("  "), null);
    assert.equal(normalizeOptionalFormString("  Solaris  "), "Solaris");
  });

  it("maps supported cover content types to file extensions", () => {
    assert.equal(getCoverFileExtension("image/jpeg"), "jpg");
    assert.equal(getCoverFileExtension("image/png"), "png");
    assert.equal(getCoverFileExtension("image/webp"), "webp");
    assert.equal(getCoverFileExtension("image/gif"), null);
  });

  it("validates cover file metadata", () => {
    assert.deepEqual(validateCoverFileInput({ size: 0, type: "" }), { ok: true });
    assert.deepEqual(validateCoverFileInput({ size: 1024, type: "image/png" }), { ok: true });
    assert.deepEqual(validateCoverFileInput({ size: 6 * 1024 * 1024, type: "image/png" }), {
      ok: false,
      error: "cover-too-large",
    });
    assert.deepEqual(validateCoverFileInput({ size: 1024, type: "image/gif" }), {
      ok: false,
      error: "cover-type",
    });
  });

  it("builds author cover object keys", () => {
    assert.equal(
      buildAuthorCoverObjectKey({
        authorId: 7,
        mediaItemCode: "author-the-matrix-abcd1234",
        contentType: "image/webp",
        uniqueId: "upload",
      }),
      "covers/authors/7/author-the-matrix-abcd1234-upload.webp",
    );
    assert.equal(
      buildAuthorCoverObjectKey({
        authorId: 7,
        mediaItemCode: "author-the-matrix-abcd1234",
        contentType: "image/gif",
        uniqueId: "upload",
      }),
      null,
    );
  });

  it("builds media codes from media type, title slug, and unique id", () => {
    assert.equal(
      buildAuthorMediaCode({
        mediaType: "film",
        title: "The Matrix: Reloaded",
        uniqueId: "abcd1234",
      }),
      "film-the-matrix-reloaded-abcd1234",
    );
  });

  it("parses optional release year as a four digit integer or null", () => {
    assert.deepEqual(parseOptionalReleaseYear(""), { ok: true, value: null });
    assert.deepEqual(parseOptionalReleaseYear(" 1999 "), { ok: true, value: 1999 });
    assert.deepEqual(parseOptionalReleaseYear("19999"), { ok: false });
    assert.deepEqual(parseOptionalReleaseYear("19xx"), { ok: false });
  });

  it("parses optional positive integers for relation ids", () => {
    assert.deepEqual(parseOptionalPositiveInteger(""), { ok: true, value: null });
    assert.deepEqual(parseOptionalPositiveInteger(" 42 "), { ok: true, value: 42 });
    assert.deepEqual(parseOptionalPositiveInteger("0"), { ok: false });
    assert.deepEqual(parseOptionalPositiveInteger("-1"), { ok: false });
    assert.deepEqual(parseOptionalPositiveInteger("1.5"), { ok: false });
  });

  it("parses required media carrier ids", () => {
    assert.deepEqual(parseRequiredMediaCarrierId(" 7 "), { ok: true, value: 7 });
    assert.deepEqual(parseRequiredMediaCarrierId(""), { ok: false });
    assert.deepEqual(parseRequiredMediaCarrierId("0"), { ok: false });
    assert.deepEqual(parseRequiredMediaCarrierId("-1"), { ok: false });
    assert.deepEqual(parseRequiredMediaCarrierId("1.5"), { ok: false });
  });

  it("validates media carrier type against media item type", () => {
    assert.deepEqual(
      validateMediaCarrierForMediaType({
        mediaCarrierId: null,
        mediaCarrierMediaType: null,
        mediaType: "film",
      }),
      { ok: true },
    );
    assert.deepEqual(
      validateMediaCarrierForMediaType({
        mediaCarrierId: 1,
        mediaCarrierMediaType: null,
        mediaType: "film",
      }),
      { ok: false, error: "invalid-carrier" },
    );
    assert.deepEqual(
      validateMediaCarrierForMediaType({
        mediaCarrierId: 1,
        mediaCarrierMediaType: "game",
        mediaType: "film",
      }),
      { ok: false, error: "carrier-media-type" },
    );
    assert.deepEqual(
      validateMediaCarrierForMediaType({
        mediaCarrierId: 1,
        mediaCarrierMediaType: "game",
        mediaType: "game",
      }),
      { ok: true },
    );
  });

  it("builds an ascii slug base from a title with a stable fallback", () => {
    assert.equal(slugifyMediaTitle("The Matrix: Reloaded"), "the-matrix-reloaded");
    assert.equal(slugifyMediaTitle("  !!!  "), "item");
  });

  it("builds generated codes from type, name, and unique id", () => {
    assert.equal(slugifyCodePart("Автор: Паша"), "avtor-pasha");
    assert.equal(
      generateEntityCode({
        type: "series",
        name: "Half-Life",
        uniqueId: "hash123",
      }),
      "series-half-life-hash123",
    );
  });

  it("allows authors to edit only draft-like records", () => {
    assert.equal(isAuthorEditablePublicationStatus("private"), true);
    assert.equal(isAuthorEditablePublicationStatus("submitted"), false);
    assert.equal(isAuthorEditablePublicationStatus("rejected"), true);
    assert.equal(isAuthorEditablePublicationStatus("published"), false);
  });
});
