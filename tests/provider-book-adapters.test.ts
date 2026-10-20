import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBookSnapshotUrl, describeBookSource, getBookDependencyDescriptors, normalizeBookSnapshots } from "@/lib/providers/book-adapters";
import { fetchBookSnapshot, fetchBookSnapshotBundle, SnapshotProviderHttpError } from "@/lib/providers/book-fetch";
import type { RawSnapshot } from "@/lib/providers/types";
import { getMediaTitleMetadataFormFields } from "@/lib/media/title-candidate-form";

test("FantLab full snapshot projects year and description into the form after search selection", () => {
  const work = { id: 42, name: "Дилвиш Проклятый", name_orig: "Dilvish, the Damned", year: 1982,
    description: " Полная аннотация из снимка. ", authors: [] };
  const primary = { ...describeBookSource("fantlab", "42"), payload: [work] };
  const projection = normalizeBookSnapshots(primary);
  assert.deepEqual(projection.fields, { title: work.name, originalTitle: work.name_orig, releaseYear: 1982, description: "Полная аннотация из снимка." });
  assert.deepEqual(getMediaTitleMetadataFormFields(projection.fields, { title: work.name, originalTitle: "", releaseYear: "1982", description: "Автор из поиска" }, false), {
    title: work.name, originalTitle: work.name_orig, releaseYear: "1982", description: "Полная аннотация из снимка.",
  });
  for (const year of ["1982", 1982]) assert.equal(normalizeBookSnapshots({ ...primary, payload: [{ ...work, year }] }).fields.releaseYear, 1982);
  for (const year of [null, "unknown", "1982-01-01", 0, 1982.5, 10000]) {
    assert.equal(normalizeBookSnapshots({ ...primary, payload: [{ ...work, year }] }).fields.releaseYear, undefined);
  }
  assert.equal(normalizeBookSnapshots({ ...primary, payload: [{ ...work, year: null, work_year: "1983" }] }).fields.releaseYear, 1983);
});

test("FantLab selects exact work from full wrapper and only autor references receive IDs", () => {
  const primary = { ...describeBookSource("fantlab", "42"), payload: { unknown: true, works: [{ id: 9 }, { id: 42, creators: { authors: [{ id: 7, name: "Автор", type: "autor" }, { id: 8, name: "Персона", type: "person" }] } }] } };
  assert.deepEqual(normalizeBookSnapshots(primary).contributors.map(({ name, externalId }) => ({ name, externalId })), [{ name: "Автор", externalId: "7" }, { name: "Персона", externalId: null }]);
  assert.throws(() => normalizeBookSnapshots({ ...primary, externalId: "43" }), /requested work/);
  assert.equal(normalizeBookSnapshots({ ...primary, payload: { works: [{ id: 42, authors: [{ name: "Автор", type: "autor" }] }] } }).contributorsComplete, false);
});

test("transport limits response bytes both from declared size and streamed body", async () => {
  for (const response of [new Response("{}", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }), new Response('"' + "x".repeat(2 * 1024 * 1024) + '"')]) {
    let saved = false;
    await assert.rejects(fetchBookSnapshot(describeBookSource("google-books", "abc"), {
      beforeRequest: async () => {}, requestStartedAt: async () => new Date(),
      saveSnapshot: async (snapshot) => { saved = true; return snapshot; }, fetchImpl: async () => response,
    }), /Слишком большой/);
    assert.equal(saved, false);
  }
});

test("FantLab cooldown covers response consumption and Retry-After supports seconds and dates", async () => {
  for (const header of ["30", new Date(Date.now() + 60_000).toUTCString()]) {
    const events: string[] = [];
    let cooldown = 0;
    await assert.rejects(fetchBookSnapshot(describeBookSource("fantlab", "42"), {
      beforeRequest: async () => { events.push("budget"); },
      requestStartedAt: async () => { events.push("clock"); return new Date(); },
      acquireFantlabSlot: async () => { events.push("slot"); return async (ms) => { events.push("release"); cooldown = ms; }; },
      saveSnapshot: async (snapshot) => { events.push("save"); return snapshot; },
      fetchImpl: async () => { events.push("http"); return new Response(null, { status: 429, headers: { "retry-after": header } }); },
    }), (error: unknown) => error instanceof SnapshotProviderHttpError && error.retryAfterSeconds >= 30);
    assert.deepEqual(events, ["budget", "slot", "clock", "http", "release"]);
    assert.ok(cooldown >= 30_000);
  }
});

test("incomplete author metadata does not replace saved snapshots", async () => {
  let saved = false;
  await assert.rejects(fetchBookSnapshot(describeBookSource("google-books", "abc"), {
    beforeRequest: async () => {}, requestStartedAt: async () => new Date(),
    saveSnapshot: async (snapshot) => { saved = true; return snapshot; },
    fetchImpl: async () => Response.json({ id: "abc", volumeInfo: { title: "Book" } }),
  }), /Incomplete/);
  assert.equal(saved, false);
});

test("missing authors are incomplete, explicit empty authors are complete", () => {
  const descriptor = describeBookSource("google-books", "abc_1");
  assert.equal(normalizeBookSnapshots({ ...descriptor, payload: { id: "abc_1", volumeInfo: {} } }).contributorsComplete, false);
  assert.equal(normalizeBookSnapshots({ ...descriptor, payload: { id: "abc_1", volumeInfo: { authors: [] } } }).contributorsComplete, true);
  assert.throws(() => normalizeBookSnapshots({ ...descriptor, payload: { id: "other", volumeInfo: {} } }), /identity/);
});

test("Open Library retains all authors, validates references, and refuses incomplete bundles", () => {
  const primary = { ...describeBookSource("open-library", "/works/OL1W"), payload: { key: "/works/OL1W", authors: Array.from({ length: 10 }, (_, i) => ({ author: { key: `/authors/OL${i + 1}A` } })) } };
  const dependencies = getBookDependencyDescriptors(primary);
  assert.equal(dependencies.length, 10);
  assert.equal(normalizeBookSnapshots(primary).contributorsComplete, false);
  const normalized = normalizeBookSnapshots(primary, dependencies.map((entry, index) => ({ ...entry, payload: { key: entry.externalId, name: `Author ${index}` } })));
  assert.equal(normalized.contributorsComplete, true);
  assert.deepEqual(normalized.contributors.map((entry) => entry.position), Array.from({ length: 10 }, (_, i) => i));
  assert.throws(() => getBookDependencyDescriptors({ ...primary, payload: { key: "/works/OL1W", authors: [{ author: { key: "https://evil.example" } }] } }));
});

test("descriptor URLs reject arbitrary hosts, methods and credential params", () => {
  assert.throws(() => describeBookSource("open-library", "//evil.example/works/OL1W"));
  assert.throws(() => buildBookSnapshotUrl({ ...describeBookSource("google-books", "abc"), requestParams: { key: "secret" } }));
  assert.equal(buildBookSnapshotUrl(describeBookSource("google-books", "abc"), "secret").hostname, "www.googleapis.com");
});

test("transport accounts each dependency request and saves full response before fetching authors", async () => {
  const events: string[] = [];
  const primary = describeBookSource("open-library", "/works/OL1W");
  const bundle = await fetchBookSnapshotBundle(primary, {
    beforeRequest: async (descriptor) => { events.push(`budget:${descriptor.externalId}`); },
    requestStartedAt: async () => new Date("2026-01-01Z"),
    saveSnapshot: async (snapshot: RawSnapshot) => { events.push(`save:${snapshot.externalId}`); return snapshot; },
    fetchImpl: async (input) => String(input).includes("/works/") ? Response.json({ key: "/works/OL1W", unknown: { retained: true }, authors: [{ author: { key: "/authors/OL2A" } }] }) : Response.json({ key: "/authors/OL2A", name: "Author", extra: 42 }),
  });
  assert.deepEqual(events, ["budget:/works/OL1W", "save:/works/OL1W", "budget:/authors/OL2A", "save:/authors/OL2A"]);
  assert.equal((bundle.primary.payload as Record<string, unknown>).unknown !== undefined, true);
  assert.equal(bundle.dependencies.length, 1);
});
