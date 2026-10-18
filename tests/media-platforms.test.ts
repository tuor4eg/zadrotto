import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractExternalPlatforms, resolvePlatformMappings } from "../src/lib/media/platforms";

const seed = JSON.parse(readFileSync("docs/data/platform-initial-mappings.json", "utf8")) as {
  records: number; values: { name: string; count: number; canonicalName: string; slug: string; normalizedName: string }[];
};
test("CSV seed preserves all 106 values and exactly the agreed 102 canonical platforms", () => {
  assert.equal(seed.records, 1456);
  assert.equal(seed.values.length, 106);
  assert.equal(new Set(seed.values.map((value) => value.slug)).size, 102);
  const find = (name: string) => seed.values.find((entry) => entry.name === name)!;
  for (const name of ["PC", "PC (Microsoft Windows)", "Linux"]) assert.equal(find(name).canonicalName, "PC");
  assert.equal(find("macOS").slug, find("Mac").slug);
  assert.equal(find("Xbox Series S/X").slug, find("Xbox Series X|S").slug);
  for (const names of [["NES", "Nintendo Entertainment System", "Family Computer"], ["Super Famicom", "Super Nintendo Entertainment System"], ["DOS", "PC", "Classic Macintosh", "Mac"]]) {
    assert.equal(new Set(names.map((name) => find(name).slug)).size, names.length);
  }
  assert.equal(find("Xbox Series X|S").count, 271);
  assert.ok(seed.values.every((value) => value.count > 0));
});
test("provider platforms stay whole and collapse normalized duplicate names without mutating facts", () => {
  const facts = { platforms: ["Xbox Series X|S", "  PC  ", "pc", "Linux"] };
  const before = structuredClone(facts);
  assert.deepEqual(extractExternalPlatforms(facts).map((value) => value.name), ["Xbox Series X|S", "PC", "Linux"]);
  assert.deepEqual(facts, before);
  assert.deepEqual(extractExternalPlatforms({}), []);
  assert.deepEqual(extractExternalPlatforms({ platforms: null }), []);
  assert.equal(extractExternalPlatforms({ platforms: "Xbox Series X|S" }).length, 1);
  assert.throws(() => extractExternalPlatforms({ platforms: ["PC", 42] }));
});
test("multiple aliases deduplicate links, unknowns await moderation, exclusions and game boundary apply", () => {
  const externalPlatforms = extractExternalPlatforms({ platforms: ["Linux", "PC", "Xbox Series X|S", "Unknown", "Excluded"] });
  const pc = { id: 1, slug: "pc", name: "PC" };
  const xbox = { id: 2, slug: "xbox", name: "Xbox" };
  const input = { externalPlatforms, provider: "igdb", mediaType: "game", excludedNames: ["excluded"], mappings: [
    { normalizedExternalPlatformName: "linux", platform: pc, isActive: true },
    { normalizedExternalPlatformName: "pc", platform: pc, isActive: true },
    { normalizedExternalPlatformName: "xbox series x|s", platform: xbox, isActive: true },
  ] };
  const result = resolvePlatformMappings(input);
  assert.deepEqual(result.platforms, [pc, xbox]);
  assert.deepEqual(result.unmapped.map((value) => value.name), ["Unknown"]);
  assert.deepEqual(resolvePlatformMappings({ ...input, mediaType: "film" }), { platforms: [], unmapped: [] });
  const multi = resolvePlatformMappings({ ...input, mappings: [...input.mappings, { normalizedExternalPlatformName: "pc", platform: xbox, isActive: true }] });
  assert.deepEqual(multi.platforms, [pc, xbox]);
});
