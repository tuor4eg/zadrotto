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
const franchisePageSource = readFileSync("src/app/series/[code]/page.tsx", "utf8");
const homePageSource = readFileSync("src/app/archive/page.tsx", "utf8");
const mediaItemFormSource = readFileSync(
  "src/app/author/(protected)/media/media-item-form.tsx",
  "utf8",
);

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
  it("locks the shared create and edit form while a submission is pending", () => {
    assert.match(mediaItemFormSource, /useActionState\(/);
    assert.match(mediaItemFormSource, /action=\{formAction\}/);
    assert.match(mediaItemFormSource, /aria-busy=\{isSubmitting\}/);
    assert.match(
      mediaItemFormSource,
      /disabled=\{isSuggestingFranchises \|\| isSubmitting\}/,
    );
    assert.match(mediaItemFormSource, /role="status"/);
    assert.match(mediaItemFormSource, /<Loader2 className="size-4 animate-spin"/);
    assert.match(mediaItemFormSource, /Пожалуйста, не закрывайте страницу\./);
  });

  it("mounts the shared suggestion layer only in the catalog and franchise page", () => {
    assert.deepEqual(findSuggestionMountFiles("src/app").sort(), [
      "src/app/archive/page.tsx",
      "src/app/series/[code]/page.tsx",
    ]);
    assert.match(franchisePageSource, /defaultFranchiseIds=\{\[franchise\.id\]\}/);
    assert.match(suggestionSource, /franchiseIds: defaultFranchiseIds/);
  });

  it("sorts creation media types by the same record counts as archive tabs", () => {
    const authorCreatePageSource = readFileSync(
      "src/app/author/(protected)/media/new/page.tsx",
      "utf8",
    );
    assert.match(homePageSource, /mediaTypesByCount = sortMediaTypesByCount\(mediaTypes, mediaTypeCounts\)/);
    assert.match(homePageSource, /<ArchiveAuthorMediaSuggestion[\s\S]*mediaTypes=\{mediaTypesByCount\}/);
    assert.match(authorCreatePageSource, /getPublishedMediaTypeCounts\(\)/);
    assert.match(authorCreatePageSource, /sortMediaTypesByCount\(effectiveMediaTypes, mediaTypeCounts\)/);
    assert.match(franchisePageSource, /getPublishedMediaTypeCounts\(\)/);
    assert.match(franchisePageSource, /sortMediaTypesByCount\(mediaTypes, authorMediaSuggestionData\.mediaTypeCounts\)/);
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
