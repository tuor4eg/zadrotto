import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionSource = readFileSync("src/app/media/franchise-actions.ts", "utf8");
const dialogSource = readFileSync(
  "src/app/media-item-franchise-suggestion-dialog.tsx",
  "utf8",
);

const submitStart = actionSource.indexOf(
  "export async function submitAuthorMediaItemFranchiseSuggestionAction",
);
const submitEnd = actionSource.indexOf(
  "\nexport async function ",
  submitStart + 1,
);
const submitSource = actionSource.slice(
  submitStart,
  submitEnd === -1 ? actionSource.length : submitEnd,
);

describe("media item new-series parent selection", () => {
  it("offers an optional parent from the published series options", () => {
    assert.match(
      dialogSource,
      /<SearchableFranchiseSelect[\s\S]*name="parentId"[\s\S]*options=\{franchises\.map\([\s\S]*value=\{parentId\}[\s\S]*onChange=\{setParentId\}/,
    );
    assert.doesNotMatch(dialogSource, /searchByTitleOnly/);
  });

  it("resets the selected parent when the dialog closes after cancel or success", () => {
    assert.match(dialogSource, /const \[parentId, setParentId\] = useState\(""\)/);
    assert.match(
      dialogSource,
      /function resetAndCloseDialog\(\) \{[\s\S]*setParentId\(""\)[\s\S]*setOpen\(false\)/,
    );
  });

  it("parses and validates a published parent for new series", () => {
    assert.match(
      submitSource,
      /const newFranchiseParentIdValue = mode === "new" \? getFormString\(formData, "parentId"\) : ""/,
    );
    assert.match(
      submitSource,
      /newFranchiseParentId !== null[\s\S]*!Number\.isSafeInteger\(newFranchiseParentId\)[\s\S]*newFranchiseParentId <= 0[\s\S]*return initialErrorState/,
    );
    assert.match(
      submitSource,
      /getPublishedFranchiseOptionById\(newFranchiseParentId\)[\s\S]*if \(newFranchiseParentId && !parent\)[\s\S]*return initialErrorState/,
    );
  });

  it("passes the validated parent id when creating and linking the new series", () => {
    assert.match(
      submitSource,
      /createAuthorFranchiseWithMediaItemLink\(\{[\s\S]*parentId: parent\?\.id \?\? null/,
    );
  });
});
