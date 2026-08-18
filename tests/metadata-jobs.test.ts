import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits"
import type { MediaTitleCandidate } from "@/lib/covers/types"
import {
  runMetadataBackfill,
  runMetadataRefresh,
  type MetadataJobItem,
  type MetadataJobStore,
} from "@/lib/media/metadata-jobs"
import { pickConfidentMetadataMatch } from "@/lib/media/rank-metadata-refresh-candidates"

const queriesSource = readFileSync("src/db/queries/media-item-metadata.ts", "utf8")
const backfillSource = readFileSync("src/lib/media/metadata-backfill.ts", "utf8")
const refreshSource = readFileSync("src/lib/media/metadata-refresh.ts", "utf8")
const fetchSource = readFileSync("src/lib/media/metadata-provider-fetch.ts", "utf8")
const schemaSource = readFileSync("src/db/schema.ts", "utf8")
const migrationSource = readFileSync("drizzle/0070_media_metadata_refresh.sql", "utf8")

function candidate(input: Partial<MediaTitleCandidate> & Pick<MediaTitleCandidate, "id" | "title">): MediaTitleCandidate {
  return {
    coverUrl: null,
    description: null,
    externalId: input.externalId ?? input.id.split(":")[1] ?? input.id,
    mediaType: input.mediaType ?? "series",
    originalTitle: input.originalTitle ?? null,
    provider: input.provider ?? "tmdb",
    releaseYear: input.releaseYear ?? null,
    sourcePageUrl: null,
    ...input,
  }
}

function item(input: Partial<MetadataJobItem> & Pick<MetadataJobItem, "id" | "title">): MetadataJobItem {
  return {
    mediaType: "series",
    originalTitle: null,
    releaseYear: 2004,
    sourceExternalId: null,
    sourceProvider: null,
    ...input,
  }
}

function createStore() {
  const attempts: number[] = []
  const upserts: Array<Record<string, unknown>> = []
  const failures: Array<Record<string, unknown>> = []
  const store: MetadataJobStore = {
    async logProviderFailure(input) {
      failures.push(input)
    },
    async markAttempt(mediaItemId) {
      attempts.push(mediaItemId)
    },
    async upsert(input) {
      upserts.push(input)
    },
  }
  return { attempts, failures, store, upserts }
}

describe("metadata job schema and selection", () => {
  it("adds metadata_attempted_at with an index for both jobs", () => {
    assert.match(schemaSource, /metadataAttemptedAt: timestamp\("metadata_attempted_at"/)
    assert.match(schemaSource, /index\("media_items_metadata_attempted_at_idx"\)\.on\(table\.metadataAttemptedAt\)/)
    assert.match(migrationSource, /ADD COLUMN "metadata_attempted_at"/)
    assert.match(migrationSource, /CREATE INDEX "media_items_metadata_attempted_at_idx"/)
  })

  it("selects known missing metadata before unmatched records", () => {
    assert.match(queriesSource, /case when \$\{knownMissing\} then 0 else 1 end/)
    assert.match(queriesSource, /sql`not \$\{hasMetadataSourceSql\}`/)
    assert.match(queriesSource, /metadataAttemptedAt\} asc nulls first/)
    assert.match(backfillSource, /getMediaItemsMissingMetadata\(/)
    assert.match(backfillSource, /input\.mediaItemId \? 1 : input\.limit \?\? 25/)
  })

  it("refreshes only stale series and anime with a known source", () => {
    assert.match(queriesSource, /METADATA_REFRESH_MEDIA_TYPES = \["series", "anime"\]/)
    assert.match(queriesSource, /inArray\(mediaItems\.mediaType, \[\.\.\.METADATA_REFRESH_MEDIA_TYPES\]\)/)
    assert.doesNotMatch(queriesSource, /METADATA_REFRESH_MEDIA_TYPES = \[[^\]]*"film"/)
    assert.doesNotMatch(queriesSource, /METADATA_REFRESH_MEDIA_TYPES = \[[^\]]*"game"/)
    assert.match(queriesSource, /fetchedAt\} < now\(\) - \(\$\{input\.staleDays\}::int \* interval '1 day'\)/)
    assert.match(refreshSource, /getMediaItemsStaleMetadata\(/)
    assert.match(refreshSource, /staleDays: input\.staleDays \?\? 90/)
    assert.match(refreshSource, /input\.mediaItemId \? 1 : input\.limit \?\? 20/)
  })

  it("shares provider quota with the UI search limiter and a reserve", () => {
    assert.match(fetchSource, /createProviderCoverSearchRateLimiter\(/)
    assert.match(fetchSource, /wrapProviderSearchWithReserve\(/)
    assert.match(fetchSource, /limiter\.canSearchProvider/)
    assert.match(backfillSource, /quotaReserve \?\? 100/)
    assert.match(refreshSource, /quotaReserve \?\? 100/)
  })
})

describe("conservative metadata match", () => {
  it("binds a unique exact title when the year also matches", () => {
    const match = pickConfidentMetadataMatch(
      [
        candidate({ id: "tmdb:1", title: "Steamboy", releaseYear: 2004 }),
        candidate({ id: "tmdb:2", title: "Other", releaseYear: 2004 }),
      ],
      { originalTitle: "", releaseYear: "2004", title: " Steamboy " },
    )

    assert.equal(match?.externalId, "1")
  })

  it("binds a unique exact original title", () => {
    const match = pickConfidentMetadataMatch(
      [candidate({ id: "anilist:100", originalTitle: "スチームボーイ", provider: "anilist", title: "Other" })],
      { originalTitle: "スチームボーイ", releaseYear: "", title: "Steamboy" },
    )

    assert.equal(match?.provider, "anilist")
  })

  it("does not bind year-only, multiple exact, or year-mismatched titles", () => {
    assert.equal(
      pickConfidentMetadataMatch(
        [candidate({ id: "tmdb:1", title: "Other", releaseYear: 2004 })],
        { originalTitle: "", releaseYear: "2004", title: "Steamboy" },
      ),
      null,
    )
    assert.equal(
      pickConfidentMetadataMatch(
        [
          candidate({ id: "tmdb:1", title: "Steamboy", releaseYear: 2004 }),
          candidate({ id: "tmdb:2", title: "Steamboy", releaseYear: 2004 }),
        ],
        { originalTitle: "", releaseYear: "2004", title: "Steamboy" },
      ),
      null,
    )
    assert.equal(
      pickConfidentMetadataMatch(
        [candidate({ id: "tmdb:1", title: "Steamboy", releaseYear: 2005 })],
        { originalTitle: "", releaseYear: "2004", title: "Steamboy" },
      ),
      null,
    )
  })
})

describe("metadata backfill and refresh runs", () => {
  it("fetches a known source without searching", async () => {
    const { attempts, store, upserts } = createStore()
    const searches: string[] = []
    const result = await runMetadataBackfill({
      context: {
        async fetchTitleMetadata(input) {
          return {
            error: null,
            metadata: {
              externalId: input.externalId,
              facts: { status: "Ended" },
              provider: input.provider,
              sourceUrl: "https://example.test/1",
            },
          }
        },
        async searchTitles(input) {
          searches.push(input.query)
          return { candidates: [], error: null }
        },
      },
      items: [
        item({
          id: 11,
          sourceExternalId: "100",
          sourceProvider: "tmdb",
          title: "Known",
        }),
      ],
      store,
    })

    assert.deepEqual(result, { failed: 0, retryableFailed: 0, skipped: 0, updated: 1 })
    assert.equal(searches.length, 0)
    assert.deepEqual(attempts, [11])
    assert.equal(upserts[0]?.sourceExternalId, "100")
  })

  it("does not write a source when unmatched search is not an exact unique title", async () => {
    const { attempts, store, upserts } = createStore()
    const result = await runMetadataBackfill({
      context: {
        async fetchTitleMetadata() {
          throw new Error("should not fetch")
        },
        async searchTitles() {
          return {
            candidates: [
              candidate({ id: "tmdb:1", title: "Close Enough", releaseYear: 2004 }),
              candidate({ id: "tmdb:2", title: "Known", releaseYear: 1999 }),
            ],
            error: null,
          }
        },
      },
      items: [item({ id: 12, title: "Known" })],
      store,
    })

    assert.deepEqual(result, { failed: 0, retryableFailed: 0, skipped: 1, updated: 0 })
    assert.deepEqual(attempts, [12])
    assert.deepEqual(upserts, [])
  })

  it("binds unmatched records only after a unique exact title match", async () => {
    const { store, upserts } = createStore()
    const result = await runMetadataBackfill({
      context: {
        async fetchTitleMetadata(input) {
          return {
            error: null,
            metadata: {
              externalId: input.externalId,
              facts: { seasons: 2 },
              provider: input.provider,
              sourceUrl: null,
            },
          }
        },
        async searchTitles() {
          return {
            candidates: [candidate({ id: "tmdb:55", releaseYear: 2004, title: "Known" })],
            error: null,
          }
        },
      },
      items: [item({ id: 13, title: "Known" })],
      store,
    })

    assert.equal(result.updated, 1)
    assert.equal(upserts[0]?.sourceExternalId, "55")
  })

  it("stops on provider daily limit without marking the current record attempted", async () => {
    const { attempts, failures, store, upserts } = createStore()
    const fetched: number[] = []
    const result = await runMetadataBackfill({
      context: {
        async fetchTitleMetadata() {
          fetched.push(1)
          return { error: "provider-daily-limit", metadata: null }
        },
        async searchTitles() {
          throw new Error("should not search")
        },
      },
      items: [
        item({ id: 21, sourceExternalId: "1", sourceProvider: "tmdb", title: "First" }),
        item({ id: 22, sourceExternalId: "2", sourceProvider: "tmdb", title: "Second" }),
      ],
      store,
    })

    assert.deepEqual(result, { failed: 0, retryableFailed: 0, skipped: 0, updated: 0 })
    assert.equal(fetched.length, 1)
    assert.deepEqual(attempts, [])
    assert.deepEqual(upserts, [])
    assert.deepEqual(failures, [])
  })

  it("marks provider-unavailable and continues to the next record", async () => {
    const { attempts, failures, store, upserts } = createStore()
    const result = await runMetadataBackfill({
      context: {
        async fetchTitleMetadata(input) {
          if (input.externalId === "1") {
            return { error: "provider-unavailable", metadata: null }
          }
          return {
            error: null,
            metadata: {
              externalId: input.externalId,
              facts: { status: "Returning Series" },
              provider: input.provider,
              sourceUrl: null,
            },
          }
        },
        async searchTitles() {
          return { candidates: [], error: null }
        },
      },
      items: [
        item({ id: 31, sourceExternalId: "1", sourceProvider: "tmdb", title: "Broken" }),
        item({ id: 32, sourceExternalId: "2", sourceProvider: "tmdb", title: "Ok" }),
      ],
      store,
    })

    assert.deepEqual(result, { failed: 1, retryableFailed: 1, skipped: 0, updated: 1 })
    assert.deepEqual(attempts, [31, 32])
    assert.equal(failures[0]?.action, "media.metadata-backfill.failed")
    assert.equal(upserts.length, 1)
  })

  it("refreshes known series without searching and skips unmatched items", async () => {
    const { attempts, store, upserts } = createStore()
    let searched = false
    const result = await runMetadataRefresh({
      context: {
        async fetchTitleMetadata(input) {
          return {
            error: null,
            metadata: {
              externalId: input.externalId,
              facts: { seasons: 5 },
              provider: input.provider,
              sourceUrl: null,
            },
          }
        },
        async searchTitles() {
          searched = true
          return { candidates: [], error: null }
        },
      },
      items: [
        item({ id: 41, sourceExternalId: "9", sourceProvider: "tmdb", title: "Series" }),
        item({ id: 42, title: "No source" }),
      ],
      store,
    })

    assert.equal(searched, false)
    assert.equal(result.updated, 1)
    assert.equal(result.skipped, 1)
    assert.deepEqual(attempts, [41, 42])
    assert.equal(upserts.length, 1)
  })
})

describe("provider quota reserve", () => {
  it("stops before incrementing when remaining quota is at the reserve", async () => {
    const searched: string[] = []
    const wrapped = wrapProviderSearchWithReserve(
      async (providerCode) => {
        searched.push(providerCode)
        return true
      },
      [{ providerCode: "tmdb", searchesPerDay: 1000 }],
      100,
      async () => ({ ok: true, used: 900 }),
    )

    assert.equal(await wrapped("tmdb"), "provider-daily-limit")
    assert.deepEqual(searched, [])
  })

  it("allows a search when remaining quota is above the reserve", async () => {
    const wrapped = wrapProviderSearchWithReserve(
      async () => true,
      [{ providerCode: "tmdb", searchesPerDay: 1000 }],
      100,
      async () => ({ ok: true, used: 899 }),
    )

    assert.equal(await wrapped("tmdb"), true)
  })

  it("treats redis unavailability as a quota stop", async () => {
    const wrapped = wrapProviderSearchWithReserve(
      async () => true,
      [{ providerCode: "tmdb", searchesPerDay: 1000 }],
      100,
      async () => ({ ok: false, error: "unavailable" }),
    )

    assert.equal(await wrapped("tmdb"), "rate-limit-unavailable")
  })
})
