import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  MAX_PROVIDER_REQUEST_TIMEOUT_MS,
  MIN_PROVIDER_REQUEST_TIMEOUT_MS,
  resolveProviderRequestTimeoutMs,
} from "@/lib/covers/config"
import { runWithProviderRequestTimeout } from "@/lib/covers/provider-request-timeout"
import {
  fetchSearchJson,
  getActiveProviderRequestTimeoutMs,
  withProviderTimeout,
} from "@/lib/covers/providers/shared"
import { searchTitleCandidates } from "@/lib/covers/registry"
import type { MediaProvider } from "@/lib/covers/types"

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

describe("provider request timeout config", () => {
  it("uses the safe default when the setting is absent", () => {
    assert.equal(resolveProviderRequestTimeoutMs(undefined), DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS)
    assert.equal(resolveProviderRequestTimeoutMs(null), DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS)
    assert.equal(getActiveProviderRequestTimeoutMs(), DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS)
  })

  it("uses a saved value instead of the default", () => {
    assert.equal(resolveProviderRequestTimeoutMs(20_000), 20_000)
    assert.equal(
      runWithProviderRequestTimeout(20_000, () => getActiveProviderRequestTimeoutMs()),
      20_000,
    )
  })

  it("falls back to the default for values below the minimum", () => {
    assert.equal(
      resolveProviderRequestTimeoutMs(MIN_PROVIDER_REQUEST_TIMEOUT_MS - 1),
      DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
    )
  })

  it("falls back to the default for values above the maximum", () => {
    assert.equal(
      resolveProviderRequestTimeoutMs(MAX_PROVIDER_REQUEST_TIMEOUT_MS + 1),
      DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
    )
  })

  it("falls back to the default for corrupted values so fetch stays bounded", () => {
    assert.equal(resolveProviderRequestTimeoutMs(Number.NaN), DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS)
    assert.equal(resolveProviderRequestTimeoutMs("15000"), DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS)
    assert.equal(resolveProviderRequestTimeoutMs({}), DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS)

    const signal = withProviderTimeout(resolveProviderRequestTimeoutMs(undefined))
    assert.equal(signal.aborted, false)
    assert.ok(typeof AbortSignal.timeout === "function")
  })
})

describe("provider request timeout runtime", () => {
  it("preserves a caller AbortSignal and combines it with the timeout", () => {
    const controller = new AbortController()
    const combined = withProviderTimeout(5_000, controller.signal)

    assert.equal(combined.aborted, false)
    controller.abort()
    assert.equal(combined.aborted, true)
  })

  it("keeps multi-provider search alive when one provider times out", async () => {
    const providers = [
      {
        code: "anilist",
        mediaTypes: ["anime"],
        async searchTitleCandidates() {
          throw new DOMException("The operation was aborted.", "AbortError")
        },
      },
      {
        code: "jikan",
        mediaTypes: ["anime"],
        async searchTitleCandidates() {
          return [
            {
              id: "anime:1",
              provider: "jikan",
              externalId: "1",
              mediaType: "anime",
              title: "Cowboy Bebop",
              originalTitle: null,
              description: null,
              coverUrl: null,
              sourcePageUrl: null,
              releaseYear: 1998,
              platforms: [],
              confidence: null,
            },
          ]
        },
      },
    ] as const satisfies readonly MediaProvider[]

    const result = await searchTitleCandidates(
      { mediaType: "anime", query: "Cowboy Bebop" },
      providers,
      {
        candidateLimit: 8,
        tmdbResultScanLimit: 3,
        requestTimeoutMs: 1_000,
      },
      [
        {
          mediaType: "anime",
          providerCode: "anilist",
          enabled: true,
          titleSearchMode: "parallel",
          coverSearchEnabled: true,
          priority: 10,
        },
        {
          mediaType: "anime",
          providerCode: "jikan",
          enabled: true,
          titleSearchMode: "parallel",
          coverSearchEnabled: true,
          priority: 20,
        },
      ],
    )

    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0]?.provider, "jikan")
    assert.equal(result.error, null)
  })

  it("applies the active timeout to shared HTTP helpers", async () => {
    const originalFetch = globalThis.fetch
    let observedSignal: AbortSignal | null | undefined

    globalThis.fetch = async (_input, init) => {
      observedSignal = init?.signal
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    try {
      await runWithProviderRequestTimeout(7_000, () =>
        fetchSearchJson(new URL("https://example.com/search")),
      )
      assert.ok(observedSignal)
      assert.equal(observedSignal?.aborted, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("applies timeout to IGDB HTTP calls that bypass shared helpers", () => {
    const igdbSource = readProjectFile("src/lib/covers/providers/igdb.ts")

    assert.match(igdbSource, /withProviderTimeout\(getActiveProviderRequestTimeoutMs\(\)\)/)
    assert.match(igdbSource, /fetch\("https:\/\/api\.igdb\.com\/v4\/games"/)
  })
})

describe("provider request timeout admin wiring", () => {
  it("requires administrator authorization to update cover settings", () => {
    const actions = readProjectFile("src/app/admin/(protected)/settings/actions.ts")

    assert.match(
      actions,
      /export async function updateCoverSettingsAction[\s\S]*await requireAdminUser\(\)/,
    )
    assert.match(actions, /providerRequestTimeoutSeconds: getFormString\(formData, "providerRequestTimeoutSeconds"\)/)
    assert.match(actions, /providerRequestTimeoutMs: settings\.value\.providerRequestTimeoutMs/)
  })

  it("loads the timeout with cover settings and passes it into provider searches", () => {
    const coverRoute = readProjectFile("src/app/api/cover-candidates/route.ts")
    const titleRoute = readProjectFile("src/app/api/media-title-candidates/route.ts")
    const metadataRoute = readProjectFile("src/app/api/media-title-metadata/route.ts")
    const metadataJobs = readProjectFile("src/lib/media/metadata-provider-fetch.ts")
    const form = readProjectFile(
      "src/app/admin/(protected)/tools/providers/provider-limits-form.tsx",
    )
    const migration = readProjectFile("drizzle/0092_cover_provider_request_timeout.sql")

    assert.match(coverRoute, /requestTimeoutMs: coverSettings\.providerRequestTimeoutMs/)
    assert.match(titleRoute, /requestTimeoutMs: coverSettings\.providerRequestTimeoutMs/)
    assert.match(metadataRoute, /requestTimeoutMs: coverSettings\.providerRequestTimeoutMs/)
    assert.match(metadataJobs, /requestTimeoutMs: coverSettings\.providerRequestTimeoutMs/)
    assert.match(form, /Таймаут запросов к внешним каталогам/)
    assert.match(form, /name="providerRequestTimeoutSeconds"/)
    assert.match(migration, /"provider_request_timeout_ms" integer DEFAULT 15000 NOT NULL/)
    assert.match(migration, /BETWEEN 1000 AND 120000/)
  })

  it("keeps Roblox on its dedicated timeout path", () => {
    const roblox = readProjectFile("src/lib/covers/providers/roblox.ts")
    const adapter = readProjectFile("src/lib/covers/providers/roblox-search-adapter.ts")

    assert.match(roblox, /const API_TIMEOUT_MS = 8_000/)
    assert.match(roblox, /timeoutMs\?: number/)
    assert.doesNotMatch(roblox, /getActiveProviderRequestTimeoutMs/)
    assert.doesNotMatch(adapter, /getActiveProviderRequestTimeoutMs/)
  })
})
