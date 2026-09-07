import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const coverPickerSource = readFileSync("src/components/ui/cover-picker.tsx", "utf8");

describe("cover picker default candidate", () => {
  it("submits the first available candidate when no cover was selected", () => {
    assert.match(
      coverPickerSource,
      /const submittedCandidateToken =\s*selectedCandidateToken \|\|\s*\(!previewUrl && !isCoverRemoved \? visibleCandidates\[0\]\?\.token \?\? "" : ""\)/,
    );
    assert.match(
      coverPickerSource,
      /name="coverCandidateToken" value=\{submittedCandidateToken\}/,
    );
  });

  it("does not restore a candidate after an explicit cover removal", () => {
    assert.match(
      coverPickerSource,
      /value=\{isCoverRemoved && !submittedCandidateToken \? "remove" : "keep"\}/,
    );
  });
});
