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
} from "../src/lib/author-media-form";

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

  it("builds author media codes from author code, title slug, and unique id", () => {
    assert.equal(
      buildAuthorMediaCode({
        authorCode: "pasha",
        title: "The Matrix: Reloaded",
        uniqueId: "abcd1234",
      }),
      "pasha-the-matrix-reloaded-abcd1234",
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

  it("builds an ascii slug base from a title with a stable fallback", () => {
    assert.equal(slugifyMediaTitle("The Matrix: Reloaded"), "the-matrix-reloaded");
    assert.equal(slugifyMediaTitle("  !!!  "), "archive-entry");
  });

  it("allows authors to edit only non-published records", () => {
    assert.equal(isAuthorEditablePublicationStatus("private"), true);
    assert.equal(isAuthorEditablePublicationStatus("submitted"), true);
    assert.equal(isAuthorEditablePublicationStatus("rejected"), true);
    assert.equal(isAuthorEditablePublicationStatus("published"), false);
  });
});
