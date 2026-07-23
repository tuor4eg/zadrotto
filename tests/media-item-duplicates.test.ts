import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMediaItemDuplicateAcknowledgementToken,
  isExactMediaItemDuplicate,
  normalizeMediaItemDuplicateTitle,
  verifyMediaItemDuplicateAcknowledgementToken,
  type MediaItemDuplicateCheckInput,
  type MediaItemDuplicateMatch,
} from "@/lib/media/media-item-duplicates";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";

const form = {
  mediaType: "film",
  title: "The Matrix",
  originalTitle: "Матрица",
  releaseYear: 1999,
} satisfies MediaItemDuplicateCheckInput;

const match = {
  id: 7,
  code: "film-the-matrix",
  mediaType: "film",
  title: "Матрица",
  originalTitle: "The Matrix",
  releaseYear: 1999,
} satisfies MediaItemDuplicateMatch;

describe("media item duplicate checks", () => {
  it("normalizes title whitespace and casing", () => {
    assert.equal(normalizeMediaItemDuplicateTitle("  The   Matrix  "), "the matrix");
  });

  it("detects exact duplicates by media type, comparable title and release year", () => {
    assert.equal(isExactMediaItemDuplicate(form, match), true);
    assert.equal(
      isExactMediaItemDuplicate(form, {
        ...match,
        releaseYear: 2003,
      }),
      false,
    );
    assert.equal(
      isExactMediaItemDuplicate(form, {
        ...match,
        mediaType: "book",
      }),
      false,
    );
    assert.equal(
      isExactMediaItemDuplicate(
        {
          ...form,
          releaseYear: null,
        },
        match,
      ),
      false,
    );
  });

  it("signs duplicate acknowledgement for the current form and matches", () => {
    process.env.MEDIA_ITEM_DUPLICATE_SECRET = "test-duplicate-secret";

    const token = createMediaItemDuplicateAcknowledgementToken({
      form,
      matches: [match],
    });

    assert.equal(
      verifyMediaItemDuplicateAcknowledgementToken(token, {
        form,
        matches: [match],
      }),
      true,
    );
    assert.equal(
      verifyMediaItemDuplicateAcknowledgementToken(token, {
        form: { ...form, title: "The Matrix Reloaded" },
        matches: [match],
      }),
      false,
    );
    assert.equal(
      verifyMediaItemDuplicateAcknowledgementToken(token, {
        form,
        matches: [{ ...match, id: 8 }],
      }),
      false,
    );
    assert.equal(verifyMediaItemDuplicateAcknowledgementToken(`${token}x`, { form, matches: [match] }), false);
  });

  it("keeps acknowledgement stable after shared alias normalization", () => {
    process.env.MEDIA_ITEM_DUPLICATE_SECRET = "test-duplicate-secret";
    const aliases = normalizeMediaItemTitleAliases(
      ["", " the matrix ", "Neo", "neo", " Матрица "],
      { title: form.title, originalTitle: form.originalTitle },
    );
    const normalizedForm = { ...form, aliases };
    const token = createMediaItemDuplicateAcknowledgementToken({
      form: normalizedForm,
      matches: [match],
    });

    assert.deepEqual(aliases, ["Neo"]);
    assert.equal(
      verifyMediaItemDuplicateAcknowledgementToken(token, {
        form: normalizedForm,
        matches: [match],
      }),
      true,
    );
  });
});
