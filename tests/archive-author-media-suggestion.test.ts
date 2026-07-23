import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const suggestionSource = readFileSync(
  "src/app/archive-author-media-suggestion.tsx",
  "utf8",
);
const actionSource = readFileSync(
  "src/app/author/(protected)/media/actions.ts",
  "utf8",
);
const archiveToastsSource = readFileSync("src/components/ui/archive-toasts.tsx", "utf8");
const franchisePageSource = readFileSync("src/app/franchises/[code]/page.tsx", "utf8");
const homePageSource = readFileSync("src/app/page.tsx", "utf8");

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
    assert.match(suggestionSource, /nextSearchParams\.delete\("suggestedItemCode"\)/);
    assert.match(suggestionSource, /nextSearchParams\.delete\("suggestedItemId"\)/);

    assert.match(franchisePageSource, /query\.suggestionError/);
    assert.match(franchisePageSource, /query\.suggested === "created"/);
    assert.match(franchisePageSource, /query\.suggested === "submitted"/);
    assert.match(franchisePageSource, /query\.suggested === "published"/);
    assert.match(
      franchisePageSource,
      /"suggestedItemCode",[\s\S]*"suggestedItemId",[\s\S]*"suggestionError",/,
    );
  });

  it("links the home-page success toast to the created media item", () => {
    assert.match(
      actionSource,
      /appendRedirectParam\(redirectPath, "suggestedItemId", String\(item\.id\)\)/,
    );
    assert.match(
      actionSource,
      /appendRedirectParam\(pathWithId, "suggestedItemCode", item\.code\)/,
    );
    assert.match(
      actionSource,
      /"successRedirectTo",[\s\S]*result\.item,[\s\S]*"publishedSuccessRedirectTo",[\s\S]*updatedItem,[\s\S]*"submittedSuccessRedirectTo",[\s\S]*updatedItem,/,
    );

    assert.match(homePageSource, /`\/author\/media\/\$\{suggestedItemId\}\/edit`/);
    assert.match(
      homePageSource,
      /`\/author\/media\?q=\$\{encodeURIComponent\(params\.suggestedItemCode\)\}`/,
    );
    assert.match(
      homePageSource,
      /`\/media\/\$\{encodeURIComponent\(params\.suggestedItemCode\)\}`/,
    );
    assert.match(homePageSource, /link: \{ href: suggestedItemHref, label: "Запись" \}/);
    assert.match(archiveToastsSource, /<Link[\s\S]*href=\{message\.link\.href\}[\s\S]*\{message\.link\.label\}[\s\S]*<\/Link>/);
  });
});
