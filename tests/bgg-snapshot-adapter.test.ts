import assert from "node:assert/strict";
import { test } from "node:test";
import { bggProjectionLegacyFacts, describeBggSource, normalizeBggSnapshot } from "../src/lib/providers/bgg-adapter";
import { snapshotHash } from "../src/lib/providers/snapshot-values";
import { bggSnapshotXml } from "./bgg-snapshot-fixtures";

const normalize = (payload: unknown, externalId = "42", providerCode = "bgg") => normalizeBggSnapshot({ providerCode, externalId, payload: payload as string });

test("BGG projection keeps creator roles and compact facts while preserving complete XML evidence", () => {
  const payload = bggSnapshotXml();
  const before = snapshotHash(payload);
  const projected = normalize(payload);
  assert.deepEqual(projected.creatorReferences, [{ externalId: "101", name: "Designer", roleCode: "designer" }, { externalId: "101", name: "Designer", roleCode: "artist" }]);
  assert.deepEqual(projected.genreFacts, { genres: ["Animals"], genreReferences: [{ id: "7", name: "Animals" }] });
  assert.deepEqual(projected.fields.aliases, ["Крылья"]);
  assert.equal(projected.fields.description, "Birds <friends> & games");
  assert.deepEqual(projected.facts, { bggItemType: "boardgame", mechanics: ["Drafting"], publishers: ["Publisher"], minPlayers: 1, maxPlayers: 5, runtimeMinutes: 60, minPlayingTimeMinutes: 40, maxPlayingTimeMinutes: 70, minAge: 10 });
  for (const key of ["genres", "genreReferences", "authors", "artists", "bggCreators", "alternateNames"]) assert.equal(key in projected.facts, false);
  assert.equal(snapshotHash(payload), before);
  assert.match(payload, /unknown future="preserved"/);
  assert.deepEqual(bggProjectionLegacyFacts(projected).authors, ["Designer"]);
  assert.deepEqual(normalize(bggSnapshotXml("42", { empty: true })).creatorReferences, []);
});

test("BGG raw requires one exact boardgame identity and complete safe XML", () => {
  for (const payload of ["<items/>", "<items><item></items>", '<!DOCTYPE items><items/>', '<!ENTITY x "bad"><items/>', "<html>challenge</html>", bggSnapshotXml("43"), bggSnapshotXml().replace('type="boardgame"', 'type="rpgitem"'), bggSnapshotXml().replace('id="101" value="Designer"', 'value="Designer"')]) assert.throws(() => normalize(payload));
  assert.throws(() => normalize({ xml: bggSnapshotXml() }));
  assert.throws(() => normalize(bggSnapshotXml(), "42", "rawg"));
  for (const id of ["0", "01", "-1", "9007199254740992"]) assert.throws(() => describeBggSource(id));
  assert.deepEqual(describeBggSource("42"), { providerCode: "bgg", resourceType: "boardgame", externalId: "42", apiMethod: "thing.details", requestParams: { version: 1, type: "boardgame,boardgameexpansion" } });
});
