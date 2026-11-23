import assert from "node:assert/strict";
import { it } from "node:test";

import { parseEntrySources, parseNewEntryRelationship } from "../src/lib/media/entry-sources";
import { buildCreatorArchiveHref } from "../src/lib/media/creator-role-filter";

it("accepts an empty list and distinguishes identifiers belonging to different kinds of sources", () => {
  assert.deepEqual(parseEntrySources([], 1), []);
  assert.deepEqual(parseEntrySources(["creator:1", "entry:2", "series:1"], 1), [
    { type: "creator", id: 1 }, { type: "entry", id: 2 }, { type: "series", id: 1 },
  ]);
});

it("rejects duplicate, malformed and self-referential source lists", () => {
  for (const values of [
    ["entry:1"], ["creator:3", "creator:3"], ["series:-5"], ["series:0"],
    ["series:2147483648"], ["series:3.2"], ["entry:2:3"], ["other:3"], [null],
  ]) {
    assert.equal(parseEntrySources(values, 1), null, String(values));
  }
});

it("switches between creator scope and roles, preserving the catalog filters", () => {
  const searchParams = "creator=other&creatorRole=artist&page=2&type=film&year=2018";
  const works = buildCreatorArchiveHref({ creatorSlug: "creator", scope: "works", searchParams });
  const scopeParams = new URL(works, "https://example.test").searchParams;
  assert.deepEqual(Object.fromEntries(scopeParams), {
    creator: "creator", type: "film", year: "2018", creatorScope: "works",
  });
  const role = buildCreatorArchiveHref({ creatorSlug: "creator", roleCode: "artist", searchParams: scopeParams.toString() });
  assert.deepEqual(Object.fromEntries(new URL(role, "https://example.test").searchParams), {
    creator: "creator", type: "film", year: "2018", creatorRole: "artist",
  });
});

it("accepts an optional relationship only with both direction and valid record ID", () => {
  assert.equal(parseNewEntryRelationship(null, null), null);
  assert.deepEqual(parseNewEntryRelationship("source", "42"), { direction: "source", targetId: 42 });
  assert.deepEqual(parseNewEntryRelationship("adaptation", "42"), { direction: "adaptation", targetId: 42 });
  for (const [direction, id] of [["source", null], [null, "42"], ["creator", "42"], ["source", "2147483648"]]) {
    assert.equal(parseNewEntryRelationship(direction, id), false);
  }
});
