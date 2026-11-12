import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  DEFAULT_TIER_CONFIGURATION, emptyTierDistribution, parseTierConfiguration,
  parseTierDistribution, parseTierLocalDraft, tierRangeError, visibleTierLevels,
  resolveTierImport, sameTierDistribution, tierBackground, tierForeground, type TierDistribution,
} from "../src/lib/tier-lists/model";

const configuration = DEFAULT_TIER_CONFIGURATION;
function filled(...ids: string[]): TierDistribution {
  return { ...emptyTierDistribution(configuration), ...Object.fromEntries(ids.map((id, i) => [id, [i + 1]])) };
}

test("publication permits S–B, A–F and single occupied tiers", () => {
  for (const levels of [["s", "a", "b"], ["a", "b", "c", "d", "f"], ["c"]]) {
    const distribution = filled(...levels);
    assert.equal(tierRangeError(configuration, distribution), null);
    assert.deepEqual(visibleTierLevels(configuration, distribution).map(level => level.id), levels);
  }
});

test("publication rejects gaps and empty boards with actionable messages", () => {
  assert.match(tierRangeError(configuration, filled("s", "b"))!, /A/);
  assert.match(tierRangeError(configuration, filled("a", "f"))!, /B, C, D/);
  assert.match(tierRangeError(configuration, filled())!, /хотя бы одну запись/);
});

test("distribution rejects duplicate, excessive, unknown and malformed archive IDs", () => {
  assert.equal(parseTierDistribution({ ...filled("s"), a: [1] }, configuration), null);
  assert.equal(parseTierDistribution(filled("s", "a"), configuration, 1), null);
  assert.equal(parseTierDistribution({ ...filled("s"), other: [] }, configuration), null);
  for (const id of [0, -1, 1.5, 2147483648, "1", null]) {
    assert.equal(parseTierDistribution({ ...filled(), s: [id] }, configuration), null);
  }
  assert.deepEqual(parseTierDistribution(filled("s", "a"), configuration, 2), filled("s", "a"));
});

test("local draft and configuration contracts reject descriptions and unknown properties", () => {
  const draft = { schemaVersion: 1, clientCreationId: randomUUID(), templateId: 1,
    snapshotToken: "a".repeat(64), title: "Мой список", configuration, distribution: filled("s"), updatedAt: "2026-11-09T10:00:00Z" };
  assert.deepEqual(parseTierLocalDraft(draft), draft);
  assert.equal(parseTierLocalDraft({ ...draft, description: "Не передавать" }), null);
  assert.equal(parseTierLocalDraft({ ...draft, unknown: true }), null);
  assert.equal(parseTierLocalDraft({ ...draft, snapshotToken: "invalid" }), null);
  assert.equal(parseTierConfiguration({ ...configuration, description: "Не передавать" }), null);
  assert.equal(parseTierConfiguration({ ...configuration, levels: [{ ...configuration.levels[0], description: "Не передавать" }] }), null);
  assert.equal(parseTierConfiguration({ ...configuration, levels: [configuration.levels[0], configuration.levels[0]] }), null);
});


test("import either matches the saved list or overwrites it", () => {
  const local = { title: 'Локальный', distribution: filled('s') };
  const server = { title: 'Серверный', distribution: filled('s'), version: 2 };
  assert.equal(resolveTierImport(server, local), 'update');
  assert.equal(resolveTierImport({...server, title: local.title}, local), 'same');
});


test("saved JSONB distributions ignore level key order but preserve entry order", () => {
  const local = { ...filled('s'), s: [1, 2] };
  const stored = Object.fromEntries(Object.entries(local).reverse());
  assert.equal(sameTierDistribution(stored, local), true);
  assert.equal(resolveTierImport({ title: 'Список', distribution: stored }, { title: 'Список', distribution: local }), 'same');
  assert.equal(sameTierDistribution({ ...stored, s: [2, 1] }, local), false);
  assert.equal(sameTierDistribution({ ...stored, s: [1] }, local), false);
  assert.equal(sameTierDistribution({ ...stored, extra: [] }, local), false);
});


test("template backgrounds validate HEX and preserve legacy snapshots", () => {
  const legacy = { schemaVersion: 1, levels: configuration.levels };
  assert.deepEqual(parseTierConfiguration(legacy), legacy);
  assert.equal(tierBackground(legacy as typeof configuration), '#20201d');
  assert.equal(tierForeground(configuration), '#fafaf9');
  assert.equal(tierForeground({ ...configuration, backgroundColor: '#ffffff' }), '#1c1917');
  assert.deepEqual(parseTierConfiguration({ ...legacy, backgroundColor: '#abcdef' }), { ...legacy, backgroundColor: '#abcdef' });
  for (const backgroundColor of [null, '', '#fff', 'red', '#gggggg', 123]) {
    assert.equal(parseTierConfiguration({ ...legacy, backgroundColor }), null);
  }
});
