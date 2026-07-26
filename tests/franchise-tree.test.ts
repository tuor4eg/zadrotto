import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync("drizzle/0038_franchise_tree.sql", "utf8");
const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const franchisesQuerySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const mediaItemsQuerySource = readFileSync("src/db/queries/media-items.ts", "utf8");
const mediaItemDetailsSource = readFileSync("src/app/media-item-details.tsx", "utf8");
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

  it("correlates breadcrumbs with the selected series", () => {
    assert.match(franchisesQuerySource, /const franchiseByCode = alias\(franchises, "franchise_by_code"\)/);
    assert.match(franchisesQuerySource, /parents: franchiseParentsJsonSql\(franchiseByCode\.id\)/);
    assert.match(franchisesQuerySource, /\.from\(franchiseByCode\)/);
    assert.match(publicSeriesPageSource, /const parentBreadcrumbs = franchise\.parents\.filter\(/);
    assert.match(publicSeriesPageSource, /parent\.id !== franchise\.id/);
    assert.match(publicSeriesPageSource, /parent\.code !== franchise\.code/);
    assert.match(publicSeriesPageSource, /\{parentBreadcrumbs\.map\(\(parent\) => \(/);
  });

  it("shows every published series in a record's inherited path as its own link", () => {
    assert.match(mediaItemsQuerySource, /'path', \([\s\S]*with recursive ancestors as \(/);
    assert.match(mediaItemsQuerySource, /where parent\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/);
    assert.match(mediaItemsQuerySource, /order by depth desc/);
    assert.match(mediaItemDetailsSource, /\(franchise\.path \?\? \[franchise\]\)\.map\(\(part, index\) => \(/);
    assert.match(mediaItemDetailsSource, /index > 0 \? <span aria-hidden="true">\/<\/span> : null/);
    assert.match(mediaItemDetailsSource, /<Link href=\{`\/series\/\$\{part\.code\}`\} className=\{className\}>/);
  });

  it("includes descendant series on a parent series page and deduplicates records", () => {
    assert.match(subtreeQuerySource, /with recursive descendants as \(/);
    assert.match(subtreeQuerySource, /select child\.id from "franchises" child/);
    assert.match(subtreeQuerySource, /inner join descendants on child\.parent_id = descendants\.id/);
    assert.match(subtreeQuerySource, /mediaItemFranchises\.franchiseId\} in \(/);
    assert.match(subtreeQuerySource, /\.groupBy\([\s\S]*mediaItems\.id/);
  });

  it("keeps every matching admin branch readable through all parents and descendants", () => {
    assert.match(adminTreeQuerySource, /const visibleIds = new Set\([\s\S]*\.includes\(normalizedSearchQuery\)/);
    assert.match(adminTreeQuerySource, /while \(parentId\) \{[\s\S]*visibleIds\.add\(parentId\)/);
    assert.match(adminTreeQuerySource, /const descendantIds = \[\.\.\.\(childrenByParentId\.get\(id\) \?\? \[\]\)\]/);
    assert.match(adminTreeQuerySource, /while \(descendantIds\.length > 0\) \{[\s\S]*visibleIds\.add\(descendantId\)[\s\S]*descendantIds\.push\(\.\.\.\(childrenByParentId\.get\(descendantId\) \?\? \[\]\)\)/);
    assert.match(adminTreeQuerySource, /if \(!normalizedSearchQuery \|\| visibleIds\.has\(row\.id\)\)/);
  });

  it("renders the complete admin tree without pagination and disables deletion for non-leaf nodes", () => {
    assert.match(adminSeriesPageSource, /getAdminFranchiseTree\(searchQuery\)/);
    assert.match(adminSeriesPageSource, /function AdminFranchiseTreeRows\(/);
    assert.match(adminSeriesPageSource, /AdminFranchiseTreeRows\(\{ nodes: franchise\.children, depth: depth \+ 1 \}\)/);
    assert.match(adminSeriesPageSource, /disabled=\{franchise\.mediaItemsCount > 0 \|\| franchise\.children\.length > 0\}/);
    assert.doesNotMatch(adminSeriesPageSource, /PaginationNav|getAdminFranchises|ADMIN_FRANCHISES_PAGE_SIZE/);
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
