import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import test from "node:test";

// Read-only equivalence check against an explicitly selected database.
test("selected series preserves subtree counts and ordering without loading unrelated links", {
  skip: !process.env.SERIES_BRANCH_TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.SERIES_BRANCH_TEST_DATABASE_URL;
  const { getDbClient } = await import("../src/db");
  const { getPublishedFranchiseTree, getPublishedFranchiseBranch } = await import("../src/db/queries/franchises");
  const client = getDbClient();
  try {
    const types = await client<{ code: string }[]>`select code from media_types`;
    const codes = types.map(({ code }) => code);
    const tree = await getPublishedFranchiseTree("", codes);
    type Node = typeof tree[number];
    const nodes: Node[] = [];
    const visit = (items: Node[]) => { for (const item of items) { nodes.push(item); visit(item.children); } };
    visit(tree);
    assert.ok(nodes.length > 0, "Database needs published series with records");
    const linkQueries: string[] = [];
    client.options.debug = (_connection, query) => {
      if (query.includes('from "media_item_franchises"')) linkQueries.push(query);
    };
    for (const node of nodes) {
      assert.deepEqual(await getPublishedFranchiseBranch(node.id, codes), node);
    }
    assert.equal(linkQueries.length, nodes.length);
    for (const query of linkQueries) {
      assert.match(query, /"media_item_franchises"\."franchise_id" in \(/);
    }
    assert.equal(await getPublishedFranchiseBranch(-1, codes), null);
    assert.equal(await getPublishedFranchiseBranch(nodes[0].id, []), null);
    const { getCatalogMediaItems, getCatalogMediaTypeCounts } = await import("../src/db/queries/media-items");
    for (const includeSeriesDescendants of [true, false]) {
      const input = {
        authorRatingFilter: "all" as const,
        enabledMediaTypeCodes: codes,
        mediaTypeFilter: "all" as const,
        page: 1,
        pageSize: 24,
        searchQuery: "",
        seriesId: nodes[0].id,
        includeSeriesDescendants,
        sort: "release_year" as const,
        sortDirection: "asc" as const,
        yearFilter: null,
        yearMode: "release" as const,
      };
      const counts = await getCatalogMediaTypeCounts(input);
      const catalog = await getCatalogMediaItems(input);
      assert.equal(catalog.totalCount, counts.reduce((total, row) => total + row.count, 0));
      assert.equal(catalog.items.length, Math.min(24, catalog.totalCount));
    }
  } finally {
    client.options.debug = false;
    await client.end({ timeout: 2 });
  }
});
