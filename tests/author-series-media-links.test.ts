import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync("src/app/archive/archive-series-actions.ts", "utf8");
const clientSource = readFileSync("src/app/archive/archive-series-media-link-search.tsx", "utf8");
const seriesContextSource = readFileSync("src/app/archive/archive-series-context.tsx", "utf8");
const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const routeSource = readFileSync("src/app/api/series/[code]/media-search/route.ts", "utf8");


describe("archive series media search access", () => {
  it("hides author controls from guests and rejects unauthenticated search", () => {
    assert.match(seriesContextSource, /authorCanAddMedia \? \([\s\S]*<ArchiveSeriesMediaLinkSearch[\s\S]*\) : null/);
    assert.match(routeSource, /const \[author,[\s\S]*getCurrentAuthor\(\)/);
    assert.match(routeSource, /if \(!author\) \{[\s\S]*status: 401/);
    assert.match(actionsSource, /const author = await requireAuthor\(\)/);
  });

  it("requires a meaningful query and a published series", () => {
    assert.match(routeSource, /searchQuery\.length < 2/);
    assert.match(routeSource, /getPublishedFranchiseIdentityByCode\(code\)/);
    assert.match(routeSource, /if \(!franchise\)[\s\S]*status: 404/);
  });

  it("searches published records and excludes current published links before limiting", () => {
    const searchQuery = querySource.slice(querySource.indexOf("export function publishedMediaItemsForFranchiseSearchSql"), querySource.indexOf("export async function getPublishedFranchisesPage"));
    assert.match(searchQuery, /publishedMediaItemCondition/);
    assert.match(searchQuery, /mediaItemFranchises\.publicationStatus} as "linkStatus"/);
    assert.match(searchQuery, /const isOwnLink = linkAuthorId === input\.authorId/);
    assert.match(searchQuery, /isNull\(mediaItemFranchises\.publicationStatus\)/);
    assert.match(searchQuery, /with recursive published_branch as materialized/);
    assert.match(searchQuery, /and not exists/);
    assert.ok(searchQuery.indexOf("and not exists") < searchQuery.indexOf("limit 10"));
    assert.ok(searchQuery.indexOf("order by") < searchQuery.indexOf("limit 10"));
  });
});

describe("archive series media mutations", () => {
  it("uses guarded link mutations and revalidates current surfaces", () => {
    assert.match(actionsSource, /createAuthorMediaItemFranchiseLinks\(/);
    assert.match(actionsSource, /requestAuthorMediaItemFranchiseRemoval\(/);
    assert.match(actionsSource, /getFranchisePublicationStatusAfterAuthorSubmit\(/);
    assert.match(actionsSource, /revalidatePath\("\/archive"\)/);
    assert.doesNotMatch(actionsSource, /revalidatePath\(`\/series\//);
    assert.match(actionsSource, /"franchise\.media\.attached"/);
    assert.match(actionsSource, /"franchise\.media\.removal-requested"/);
  });
});

describe("archive series media link client", () => {
  it("renders the compact overlay and accessible absolute results", () => {
    assert.match(clientSource, /export function ArchiveSeriesMediaLinkSearch/);
    assert.doesNotMatch(clientSource, /variant/);
    assert.match(clientSource, /<ArchiveTooltip label="Добавить запись в серию" side="bottom">/);
    assert.match(clientSource, /aria-label="Найти запись для добавления в серию"/);
    assert.match(clientSource, /bg-stone-50 py-2/);
    assert.match(clientSource, /absolute right-11 top-full z-\[80\]/);
    assert.match(clientSource, /id="series-media-search-results"[\s\S]*role="region"/);
    assert.match(clientSource, /overflow-y-auto \[-ms-overflow-style:none\]/);
    assert.match(clientSource, /result\.removalStatus === "requested"/);
  });
});
