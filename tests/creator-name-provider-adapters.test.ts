import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { mapCreatorProviderRussianName, fantlabAuthorDescriptor } from "../src/lib/providers/creator-adapters";
import { creatorProfileDescriptor } from "../src/lib/providers/creator-profile-targets";

test("Russian TMDB profile canonical name is localized evidence, arbitrary aliases are not", () => {
  const descriptor = creatorProfileDescriptor({ provider: "tmdb", resourceType: "person", externalId: "17" });
  assert.equal(mapCreatorProviderRussianName({ ...descriptor, payload: { id: 17, name: "Джон Смит" } }), "Джон Смит");
  assert.equal(mapCreatorProviderRussianName({ ...descriptor, payload: { id: 17, name: "John Smith", also_known_as: ["Джон Смит"] } }), null);
  assert.throws(() => mapCreatorProviderRussianName({ ...descriptor, requestParams: { language: "en-US" }, payload: { id: 17, name: "Джон Смит" } }), /INVALID_CREATOR_SNAPSHOT/);
});

test("FantLab canonical Russian profile name is accepted without copying originalName", async () => {
  const payload = JSON.parse(await readFile("tests/fixtures/fantlab-authors/1.json", "utf8"));
  const descriptor = fantlabAuthorDescriptor("1");
  assert.equal(mapCreatorProviderRussianName({ ...descriptor, payload: { ...payload, name: "Айзек Азимов", name_orig: "Isaac Asimov" } }), "Айзек Азимов");
  assert.equal(mapCreatorProviderRussianName({ ...descriptor, payload: { ...payload, name: "Isaac Asimov", name_orig: "Айзек Азимов" } }), null);
});
