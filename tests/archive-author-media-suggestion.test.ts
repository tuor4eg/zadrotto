import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const suggestionSource = readFileSync(
  "src/app/archive-author-media-suggestion.tsx",
  "utf8",
);
const franchisePageSource = readFileSync("src/app/franchises/[code]/page.tsx", "utf8");

function findSuggestionMountFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      return findSuggestionMountFiles(path);
    }

    if (!entry.isFile() || !entry.name.endsWith(".tsx")) {
      return [];
    }

    return readFileSync(path, "utf8").includes("<ArchiveAuthorMediaSuggestion") ? [path] : [];
  });
}

describe("archive author media suggestion placement", () => {
  it("mounts the shared suggestion layer only in the catalog and franchise page", () => {
    assert.deepEqual(findSuggestionMountFiles("src/app").sort(), [
      "src/app/franchises/[code]/page.tsx",
      "src/app/page.tsx",
    ]);
    assert.match(franchisePageSource, /defaultFranchiseIds=\{\[franchise\.id\]\}/);
    assert.match(suggestionSource, /franchiseIds: defaultFranchiseIds/);
  });

  it("returns to the current page with matching success and error toast params", () => {
    assert.match(suggestionSource, /errorParamName="suggestionError"/);
    assert.match(suggestionSource, /appendParam\(currentArchivePath, "suggested", "created"\)/);
    assert.match(suggestionSource, /appendParam\(currentArchivePath, "suggested", "submitted"\)/);
    assert.match(suggestionSource, /appendParam\(currentArchivePath, "suggested", "published"\)/);

    assert.match(franchisePageSource, /query\.suggestionError/);
    assert.match(franchisePageSource, /query\.suggested === "created"/);
    assert.match(franchisePageSource, /query\.suggested === "submitted"/);
    assert.match(franchisePageSource, /query\.suggested === "published"/);
    assert.match(
      franchisePageSource,
      /clearParams=\{\["suggested", "suggestionError"\]\}/,
    );
  });
});
