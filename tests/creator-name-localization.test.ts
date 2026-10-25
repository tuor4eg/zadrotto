import assert from "node:assert/strict";
import test from "node:test";
import { canAiLocalizeCreatorName, getImportedCreatorNameLocalization, hasPredominantlyCyrillicName, isCreatorNameLocalizationResponse, parseCreatorNameLocalizationPayload } from "../src/lib/creators/name-localization";

test("majority counts all letters and ignores punctuation", () => {
  assert.equal(hasPredominantlyCyrillicName("Иван Петров"), true);
  assert.equal(hasPredominantlyCyrillicName("И A"), false);
  assert.equal(hasPredominantlyCyrillicName("И 日本"), false);
  assert.equal(hasPredominantlyCyrillicName("123"), false);
  assert.equal(hasPredominantlyCyrillicName("҂ A"), false);
});
test("manual including cleared and provider outrank automatic enrichment", () => {
  for (const source of ["manual", "provider"] as const) {
    const state = { nameRu: null, nameRuSource: source, nameRuProcessed: true };
    assert.equal(canAiLocalizeCreatorName(state), false);
    assert.deepEqual(getImportedCreatorNameLocalization({ ...state, name: "John", providerNameRu: "Джон" }), state);
  }
  assert.deepEqual(getImportedCreatorNameLocalization({ name: "John", nameRu: "Джонни", nameRuSource: "ai", providerNameRu: "Джон" }), { nameRu: "Джон", nameRuSource: "provider", nameRuProcessed: true });
  assert.equal(getImportedCreatorNameLocalization({ name: "Иван" }).nameRuProcessed, true);
});
test("batch responses match exact IDs, allow null and reject malformed names", () => {
  assert.equal(isCreatorNameLocalizationResponse({ persons: [{ id: 2, nameRu: null }, { id: 1, nameRu: "Джон" }] }, [1, 2]), true);
  for (const persons of [[{ id: 1, nameRu: "Джон" }], [{ id: 1, nameRu: "Джон" }, { id: 1, nameRu: null }], [{ id: 1, nameRu: "John" }, { id: 2, nameRu: null }], [{ id: 1, nameRu: "А".repeat(201) }, { id: 2, nameRu: null }]]) assert.equal(isCreatorNameLocalizationResponse({ persons }, [1, 2]), false);
});
test("payload defaults and strict bounds", () => {
  assert.deepEqual(parseCreatorNameLocalizationPayload({}), { batchSize: 20, requestsPerMinute: 5, requestsPerDay: 200 });
  for (const value of [{ batchSize: 51 }, { creatorIds: [1, 1] }, { provider: "deepseek" }, { requestsPerDay: 0 }]) assert.throws(() => parseCreatorNameLocalizationPayload(value));
});


test("API errors, malformed responses and aborted calls never save; null reaches persistence", async () => {
  const { runCreatorNameLocalizationFlow } = await import("../src/lib/creators/name-localization-flow");
  let saved = 0;
  const save = async () => { saved++; };
  await assert.rejects(() => runCreatorNameLocalizationFlow({ ids: [1], generate: async () => { throw new Error("timeout"); }, save }));
  await assert.rejects(() => runCreatorNameLocalizationFlow({ ids: [1], generate: async () => ({ persons: [] }), save }));
  const abort = new AbortController();
  await assert.rejects(() => runCreatorNameLocalizationFlow({ ids: [1], generate: async () => { abort.abort(); return { persons: [{ id: 1, nameRu: "Джон" }] }; }, save, signal: abort.signal }));
  assert.equal(saved, 0);
  await runCreatorNameLocalizationFlow({ ids: [1], generate: async () => ({ persons: [{ id: 1, nameRu: null }] }), save });
  assert.equal(saved, 1);
});

test("invalid provider names do not overwrite an existing AI localization", () => {
  const state = { name: "John", nameRu: "Джон", nameRuSource: "ai" as const, nameRuProcessed: true };
  for (const providerNameRu of ["И".repeat(201), "Иван\u0000Петров"]) {
    assert.equal(getImportedCreatorNameLocalization({ ...state, providerNameRu }).nameRu, "Джон");
  }
});
