import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatFirstExperiencedDate,
  formatFirstExperiencedInputValue,
  parseFirstExperiencedInput,
} from "../src/lib/experience-date";

describe("formatFirstExperiencedDate", () => {
  it("formats first experience dates by stored precision", () => {
    assert.equal(formatFirstExperiencedDate("1991-01-01", "year"), "1991");
    assert.equal(formatFirstExperiencedDate("1991-03-01", "month"), "март 1991");
    assert.equal(formatFirstExperiencedDate("1991-03-05", "day"), "5 марта 1991");
  });

  it("keeps empty or invalid dates explicit", () => {
    assert.equal(formatFirstExperiencedDate(null, "year"), null);
    assert.equal(formatFirstExperiencedDate("1991-01-01", null), null);
    assert.equal(formatFirstExperiencedDate("not-a-date", "day"), null);
  });

  it("formats date values for precision-specific form inputs", () => {
    assert.equal(formatFirstExperiencedInputValue("1991-03-05", "year"), "1991");
    assert.equal(formatFirstExperiencedInputValue("1991-03-05", "month"), "1991-03");
    assert.equal(formatFirstExperiencedInputValue("1991-03-05", "day"), "1991-03-05");
  });

  it("parses precision-specific form inputs to stored dates", () => {
    assert.deepEqual(parseFirstExperiencedInput("1991", "year"), {
      firstExperiencedAt: "1991-01-01",
      firstExperiencedPrecision: "year",
    });
    assert.deepEqual(parseFirstExperiencedInput("1991-03", "month"), {
      firstExperiencedAt: "1991-03-01",
      firstExperiencedPrecision: "month",
    });
    assert.deepEqual(parseFirstExperiencedInput("1991-03-05", "day"), {
      firstExperiencedAt: "1991-03-05",
      firstExperiencedPrecision: "day",
    });
  });

  it("rejects mismatched experience date precision", () => {
    assert.equal(parseFirstExperiencedInput("1991-03", "year"), null);
    assert.equal(parseFirstExperiencedInput("1991", "month"), null);
    assert.equal(parseFirstExperiencedInput("1991-03-05", "unknown"), null);
  });
});
