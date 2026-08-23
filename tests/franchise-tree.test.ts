import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync("drizzle/0038_franchise_tree.sql", "utf8");
const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const franchisesQuerySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const mediaItemsQuerySource = readFileSync("src/db/queries/media-items.ts", "utf8");
const mediaItemDetailsSource = readFileSync("src/app/media-item-details.tsx", "utf8");
const mediaItemFranchiseLinksSource = readFileSync(
  "src/components/archive/media-item-franchise-links.tsx",
  "utf8",
);
const adminSeriesPageSource = readFileSync("src/app/admin/(protected)/series/page.tsx", "utf8");
const publicSeriesPageSource = readFileSync("src/app/series/[code]/page.tsx", "utf8");

function getFunctionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start);

  assert.notEqual(start, -1, `Missing ${name}`);
  assert.notEqual(end, -1, `Missing boundary after ${name}`);

  return source.slice(start, end);
}

describe("franchise tree schema", () => {
  it("stores one optional parent and protects referential integrity", () => {
    assert.match(migrationSource, /ALTER TABLE "franchises" ADD COLUMN "parent_id" integer/);
    assert.match(migrationSource, /FOREIGN KEY \("parent_id"\) REFERENCES "franchises"\("id"\) ON DELETE RESTRICT/);
    assert.match(migrationSource, /CHECK \("parent_id" IS NULL OR "parent_id" <> "id"\)/);
    assert.match(migrationSource, /CREATE INDEX "franchises_parent_id_idx" ON "franchises"/);
    assert.match(schemaSource, /parentId: integer\("parent_id"\)\.references\(\(\): AnyPgColumn => franchises\.id, \{[\s\S]*onDelete: "restrict"/);
    assert.match(schemaSource, /index\("franchises_parent_id_idx"\)\.on\(table\.parentId\)/);
  });
});

describe("franchise tree mutations", () => {
  const updateSource = getFunctionSource(
    franchisesQuerySource,
    "updateFranchise",
    "deleteFranchiseIfEmpty",
  );

  it("rejects missing parents and cycles before saving a move", () => {
    assert.match(updateSource, /const parent = input\.parentId === null \? null : allFranchises\.find/);
    assert.match(updateSource, /if \(input\.parentId !== null && !parent\) throw new Error\("invalid-franchise-parent"\)/);
    assert.match(updateSource, /while \(ancestorId\) \{[\s\S]*if \(ancestorId === input\.id\) throw new Error\("franchise-parent-cycle"\)/);
  });

  it("removes redundant direct ancestor links after hierarchy changes", () => {
    assert.match(updateSource, /with recursive ancestor_links as \(/);
    assert.match(updateSource, /delete from \$\{mediaItemFranchises\} direct_link/);
    assert.match(updateSource, /direct_link\.media_item_id = descendant_link\.media_item_id/);
    assert.match(updateSource, /direct_link\.franchise_id = ancestor_links\.ancestor_id/);
    assert.match(updateSource, /ancestor_links\.ancestor_id <> ancestor_links\.descendant_id/);
  });

  it("keeps only the most specific selected series when assigning a record", () => {
    assert.match(mediaItemsQuerySource, /const uniqueFranchiseIds = await getMostSpecificFranchiseIds\(franchiseIds\)/);
    assert.match(mediaItemsQuerySource, /with recursive ancestors as \(/);
    assert.match(mediaItemsQuerySource, /return uniqueFranchiseIds\.filter\(\(id\) => !ancestorIds\.has\(id\)\)/);
  });

  it("removes published ancestor links after additive series mutations", () => {
    assert.match(franchisesQuerySource, /async function deleteRedundantPublishedMediaItemFranchiseLinks/);
    assert.match(franchisesQuerySource, /direct_link\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/);
    assert.match(franchisesQuerySource, /descendant_link\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/);
    assert.match(franchisesQuerySource, /returning[\s\S]*direct_link\.franchise_id,[\s\S]*direct_link\.media_item_id/);

    const createLinksSource = getFunctionSource(
      franchisesQuerySource,
      "createAuthorMediaItemFranchiseLinks",
      "removeAuthorMediaItemFranchiseLink",
    );
    assert.match(createLinksSource, /if \(input\.publicationStatus === "published"\) \{[\s\S]*deleteRedundantPublishedMediaItemFranchiseLinks/);
    assert.match(createLinksSource, /retainedFranchiseIds = franchiseIds\.filter/);
    assert.match(createLinksSource, /for \(const franchiseId of retainedFranchiseIds\) \{[\s\S]*type: "media-franchise\.published"/);

    const createFranchiseSource = getFunctionSource(
      franchisesQuerySource,
      "createAuthorFranchiseWithMediaItemLink",
      "getAuthorFranchiseSubmissions",
    );
    assert.match(createFranchiseSource, /if \(input\.publicationStatus === "published"\) \{[\s\S]*deleteRedundantPublishedMediaItemFranchiseLinks/);
  });

  it("normalizes approved links before emitting publication events", () => {
    const reviewFranchiseSource = getFunctionSource(
      franchisesQuerySource,
      "reviewSubmittedFranchise",
      "reviewSubmittedMediaItemFranchise",
    );
    assert.match(reviewFranchiseSource, /deleteRedundantPublishedMediaItemFranchiseLinks/);
    assert.match(reviewFranchiseSource, /if \(removedLinkKeys\.has\([\s\S]*\)\) continue/);

    const reviewLinkSource = getFunctionSource(
      franchisesQuerySource,
      "reviewSubmittedMediaItemFranchise",
      "reviewMediaItemFranchiseRemovalRequest",
    );
    assert.match(reviewLinkSource, /const linkWasRemoved = removedLinks\.some/);
    assert.match(reviewLinkSource, /if \(!linkWasRemoved\) \{[\s\S]*type: "media-franchise\.published"/);
    assert.match(reviewLinkSource, /if \(!linkWasRemoved\) \{[\s\S]*type: "media-franchise\.approved"/);
  });

  it("serializes additive and approval mutations for the same record", () => {
    assert.match(franchisesQuerySource, /async function lockMediaItemFranchiseMutations/);
    assert.match(franchisesQuerySource, /pg_advisory_xact_lock/);
    assert.match(franchisesQuerySource, /uniqueMediaItemIds[\s\S]*sort\(\(left, right\) => left - right\)/);

    for (const functionName of [
      "reviewSubmittedFranchise",
      "reviewSubmittedMediaItemFranchise",
      "createAuthorMediaItemFranchiseLinks",
      "createAuthorFranchiseWithMediaItemLink",
    ]) {
      const start = franchisesQuerySource.indexOf(`export async function ${functionName}`);
      const next = franchisesQuerySource.indexOf("export async function ", start + 1);
      const source = franchisesQuerySource.slice(start, next === -1 ? undefined : next);
      assert.match(source, /lockMediaItemFranchiseMutations/);
    }
  });
});

describe("franchise tree display and traversal", () => {
  const adminTreeQuerySource = getFunctionSource(
    franchisesQuerySource,
    "getAdminFranchiseTree",
    "getAdminFranchiseById",
  );
  const subtreeQuerySource = getFunctionSource(
    franchisesQuerySource,
    "getMediaItemsByFranchiseId",
    "getAdminMediaItemsByFranchiseId",
  );

  it("builds breadcrumbs only from the selected series parent chain", () => {
    const franchiseByCodeSource = getFunctionSource(
      franchisesQuerySource,
      "getFranchiseByCode",
      "getFranchiseOptions",
    );

    assert.match(franchiseByCodeSource, /parentId: franchises\.parentId/);
    assert.match(franchiseByCodeSource, /const visitedParentIds = new Set\(\[franchise\.id\]\)/);
    assert.match(franchiseByCodeSource, /while \(parentId && !visitedParentIds\.has\(parentId\)\)/);
    assert.match(franchiseByCodeSource, /eq\(franchises\.id, parentId\)/);
    assert.match(franchiseByCodeSource, /parents\.unshift\(\{ id: parent\.id, code: parent\.code, title: parent\.title \}\)/);
    assert.match(publicSeriesPageSource, /const parentBreadcrumbs = franchise\.parents\.filter\(/);
    assert.match(publicSeriesPageSource, /parent\.id !== franchise\.id/);
    assert.match(publicSeriesPageSource, /parent\.code !== franchise\.code/);
    assert.match(publicSeriesPageSource, /\{parentBreadcrumbs\.map\(\(parent\) => \(/);
  });

  it("shows every published series in a record's inherited path as its own link", () => {
    assert.match(mediaItemsQuerySource, /'path', \([\s\S]*with recursive ancestors as \(/);
    assert.match(mediaItemsQuerySource, /where parent\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/);
    assert.match(mediaItemsQuerySource, /order by depth desc/);
    assert.match(mediaItemDetailsSource, /<MediaItemFranchiseLinks/);
    assert.match(mediaItemFranchiseLinksSource, /\(franchise\.path \?\? \[franchise\]\)\.map\(\(part, index\) => \(/);
    assert.match(mediaItemFranchiseLinksSource, /index > 0 \? <span aria-hidden="true">\/<\/span> : null/);
    assert.match(mediaItemFranchiseLinksSource, /<Link href=\{`\/series\/\$\{part\.code\}`\} className=\{className\}>/);
  });

  it("includes descendant series on a parent series page and deduplicates records", () => {
    assert.match(franchisesQuerySource, /function publishedFranchiseBranchIdsSql/);
    assert.match(franchisesQuerySource, /with recursive descendants as \(/);
    assert.match(franchisesQuerySource, /select child\.id/);
    assert.match(franchisesQuerySource, /inner join descendants parent on child\.parent_id = parent\.id/);
    assert.match(subtreeQuerySource, /publishedFranchiseBranchIdsSql\(franchiseId\)/);
    assert.match(subtreeQuerySource, /mediaItemFranchises\.franchiseId\} in \(/);
    assert.match(subtreeQuerySource, /\.groupBy\([\s\S]*mediaItems\.id/);
  });

  it("keeps every matching admin branch readable through all parents and descendants", () => {
    assert.match(adminTreeQuerySource, /getFranchiseSearchVisibleIds\(\{[\s\S]*publishedOnly: false/);
    assert.match(adminTreeQuerySource, /visibleIds \? inArray\(franchises\.id, visibleIds\) : undefined/);
    assert.match(franchisesQuerySource, /with recursive direct_matches as/);
    assert.match(franchisesQuerySource, /inner join ancestors child on child\.parent_id = parent\.id/);
    assert.match(franchisesQuerySource, /inner join descendants parent on child\.parent_id = parent\.id/);
  });

  it("paginates complete admin branches and disables deletion for non-leaf nodes", () => {
    const adminListQuerySource = getFunctionSource(
      franchisesQuerySource,
      "getAdminFranchises",
      "getAdminFranchiseTree",
    );

    assert.match(
      adminSeriesPageSource,
      /getAdminFranchises\(\{[\s\S]*page: parsePage\(params\.page\),[\s\S]*pageSize: ADMIN_FRANCHISES_PAGE_SIZE,[\s\S]*searchQuery/,
    );
    assert.match(adminSeriesPageSource, /ADMIN_FRANCHISES_PAGE_SIZE = 50/);
    assert.match(
      adminSeriesPageSource,
      /paginationSearchParams = \{[\s\S]*q: searchQuery \|\| undefined/,
    );
    assert.match(
      adminSeriesPageSource,
      /<PaginationNav[\s\S]*basePath="\/admin\/series"[\s\S]*searchParams=\{paginationSearchParams\}/,
    );
    assert.match(adminSeriesPageSource, /function AdminFranchiseTreeRows\(/);
    assert.match(
      adminSeriesPageSource,
      /AdminFranchiseTreeRows\(\{ nodes: franchise\.children, depth: depth \+ 1 \}\)/,
    );
    assert.match(adminSeriesPageSource, /<AdminFranchiseTreeRows nodes=\{franchises\} \/>/);
    assert.match(adminSeriesPageSource, /disabled=\{franchise\.mediaItemsCount > 0 \|\| franchise\.children\.length > 0\}/);
    assert.match(
      adminListQuerySource,
      /getAdminFranchiseTree\(input\.searchQuery\)/,
    );
    assert.match(adminListQuerySource, /const paginationTotalCount = tree\.items\.length/);
    assert.match(adminListQuerySource, /items: tree\.items\.slice\(offset, offset \+ input\.pageSize\)/);
    assert.match(adminListQuerySource, /paginationTotalCount,[\s\S]*totalCount: tree\.totalCount/);
    assert.doesNotMatch(adminListQuerySource, /\.limit\(|\.offset\(/);
  });

  it("also refuses to delete a node that gained children after the admin page was rendered", () => {
    const deleteSource = getFunctionSource(
      franchisesQuerySource,
      "deleteFranchiseIfEmpty",
      "getMediaItemsByFranchiseId",
    );

    assert.match(deleteSource, /notExists\([\s\S]*mediaItemFranchises\.franchiseId/);
    assert.match(deleteSource, /notExists\([\s\S]*franchises\.parentId, id/);
  });
});
