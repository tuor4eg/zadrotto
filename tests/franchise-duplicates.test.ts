import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createFranchiseDuplicateAcknowledgementToken,
  isExactFranchiseDuplicate,
  verifyFranchiseDuplicateAcknowledgementToken,
  type FranchiseDuplicateCheckInput,
} from "@/lib/franchises/franchise-duplicates";
import type { FranchiseDuplicateMatch } from "@/db/queries/franchises";

const form = {
  title: "  The   Matrix  ",
  originalTitle: "Матрица",
} satisfies FranchiseDuplicateCheckInput;

const match = {
  id: 7,
  code: "series-the-matrix",
  title: "Матрица",
  originalTitle: "The Matrix",
} satisfies FranchiseDuplicateMatch;

describe("franchise duplicate checks", () => {
  it("recognizes matching title or original title regardless of whitespace and casing", () => {
    assert.equal(isExactFranchiseDuplicate(form, match), true);
    assert.equal(isExactFranchiseDuplicate(form, { ...match, originalTitle: "Different" }), true);
    assert.equal(
      isExactFranchiseDuplicate({ ...form, originalTitle: null, title: "Different" }, match),
      false,
    );
  });

  it("signs acknowledgement only for the current form and candidate set", () => {
    process.env.FRANCHISE_DUPLICATE_SECRET = "test-franchise-duplicate-secret";
    const token = createFranchiseDuplicateAcknowledgementToken({ form, matches: [match] });

    assert.equal(verifyFranchiseDuplicateAcknowledgementToken(token, { form, matches: [match] }), true);
    assert.equal(
      verifyFranchiseDuplicateAcknowledgementToken(token, {
        form: { ...form, title: "The Matrix Reloaded" },
        matches: [match],
      }),
      false,
    );
    assert.equal(
      verifyFranchiseDuplicateAcknowledgementToken(token, { form, matches: [{ ...match, id: 8 }] }),
      false,
    );
  });
});
