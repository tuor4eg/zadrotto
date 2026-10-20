import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { MediaTitleMetadata, TitleMetadataOptions } from "../src/lib/covers/types";
import type { BookProjection, BookProviderCode, JSONValue } from "../src/lib/providers/types";
import { getMediaTitleMetadataFormFields } from "../src/lib/media/title-candidate-form";

type Fixture = { externalId: string; payload: JSONValue; fields: BookProjection["fields"] };
const fixtures = {
  fantlab: {
    externalId: "42", payload: [{ id: 42, name: "FantLab detail", name_orig: "FantLab original", year: 1982, description: "FantLab description", authors: [] }],
    fields: { title: "FantLab detail", originalTitle: "FantLab original", releaseYear: 1982, description: "FantLab description" },
  },
  "google-books": {
    externalId: "volume_42", payload: { id: "volume_42", volumeInfo: { title: "Google detail", subtitle: "Google subtitle", publishedDate: "2001-04-12", description: "Google description", authors: [] } },
    fields: { title: "Google detail", originalTitle: "Google subtitle", releaseYear: 2001, description: "Google description" },
  },
  "open-library": {
    externalId: "/works/OL42W", payload: { key: "/works/OL42W", title: "Open Library detail", first_publish_date: "1997-06-10", description: { value: "Open Library description" }, authors: [] },
    fields: { title: "Open Library detail", releaseYear: 1997, description: "Open Library description" },
  },
} satisfies Record<BookProviderCode, Fixture>;

// Explicit opt-in. The only writes are snapshots in this disposable schema.
test("book fields survive DB, metadata service and JSON transport without changing background enrichment", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async t => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const originalUrl = process.env.DATABASE_URL!;
  const originalFetch = globalThis.fetch;
  const admin = postgres(originalUrl, { max: 1, prepare: false, onnotice: () => {} });
  const schema = `book_fields_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(originalUrl);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  let networkCalls = 0;
  let budgetCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("SAVED_BOOK_FIELDS_MUST_NOT_FETCH"); };
  try {
    const migration = await readFile("drizzle/0127_provider_snapshots.sql", "utf8");
    await client.unsafe(migration.split("ALTER TABLE entry_creator_sources")[0].replaceAll("--> statement-breakpoint", ""));
    const { saveProviderSnapshot } = await import("../src/db/queries/provider-snapshots");
    const { describeBookSource } = await import("../src/lib/providers/book-adapters");
    const { fetchBookMetadata, getSavedBookBundle } = await import("../src/lib/providers/book-service");
    const options: TitleMetadataOptions = {
      candidateLimit: 1, tmdbResultScanLimit: 1, snapshotReuseAfter: new Date("2000-01-01T00:00:00Z"),
      beforeProviderSearch: async () => { budgetCalls++; throw new Error("REUSED_SNAPSHOT_MUST_NOT_RESERVE_BUDGET"); },
    };
    const selected = { title: "Search title", originalTitle: "Search original", releaseYear: "1901", description: "Search description" };
    for (const [provider, fixture] of Object.entries(fixtures) as [BookProviderCode, Fixture][]) {
      await t.test(`${provider}: raw JSONB -> service.fields -> JSON -> form`, async () => {
        const primary = await saveProviderSnapshot({ ...describeBookSource(provider, fixture.externalId), payload: fixture.payload,
          payloadHash: "", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
        const input = { provider, externalId: fixture.externalId, mediaType: "book" as const };
        const metadata = await fetchBookMetadata(input, { ...options, enrichTitleFields: true });
        assert.deepEqual(metadata.fields, fixture.fields);
        assert.deepEqual(metadata.snapshotReferences, [{ id: primary.id, payloadHash: primary.payloadHash }]);
        const transported = JSON.parse(JSON.stringify(metadata)) as MediaTitleMetadata;
        assert.deepEqual(transported.fields, fixture.fields);
        assert.deepEqual(getMediaTitleMetadataFormFields(transported.fields, selected, false), {
          title: fixture.fields.title,
          originalTitle: fixture.fields.originalTitle ?? "Search original",
          releaseYear: String(fixture.fields.releaseYear),
          description: fixture.fields.description,
        });
        const saved = await getSavedBookBundle(provider, fixture.externalId);
        assert.deepEqual(saved.primary.payload, fixture.payload);
        assert.deepEqual(saved.projection.fields, fixture.fields);
        for (const backgroundOptions of [options, { ...options, enrichTitleFields: false }]) {
          const background = await fetchBookMetadata(input, backgroundOptions);
          assert.equal(background.fields, undefined);
          assert.equal(Object.hasOwn(background, "fields"), false, "background consumers cannot write editorial fields");
          assert.deepEqual(getMediaTitleMetadataFormFields(background.fields, selected, false), selected);
        }
      });
    }
    assert.equal(networkCalls, 0);
    assert.equal(budgetCalls, 0);
  } finally {
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = originalUrl;
    globalThis.fetch = originalFetch;
  }
});
