import type { ProviderTitlePart, MediaTitleCandidate, TitleMetadataInput, TitleSearchInput } from "@/lib/covers/types"
import { isCoverProviderCode } from "@/lib/covers/types"
import { isMediaTypeCode } from "@/lib/media/types"
import { normalizeMetadataExternalId } from "@/lib/media/metadata-refresh-source"
import { explainMetadataMatch } from "@/lib/media/rank-metadata-refresh-candidates"
import type { MetadataIssueCode } from "@/lib/media/metadata-issue"

export const METADATA_QUOTA_STOP_ERRORS = ["provider-daily-limit", "rate-limit-unavailable"] as const

export type MetadataJobItem = {
  id: number
  mediaType: string
  platformCode: string | null
  originalTitle: string | null
  releaseYear: number | null
  sourceExternalId: string | null
  sourceProvider: string | null
  title: string
}

export type MetadataJobUpdatedItem = {
  id: number
  title: string
}

export type MetadataJobResult = {
  failed: number
  retryableFailed: number
  skipped: number
  updated: number
  updatedItems: MetadataJobUpdatedItem[]
  stopError?: "provider-daily-limit" | "rate-limit-unavailable"
}

export type MetadataJobContext = {
  fetchAniListCreators?: (input: TitleMetadataInput) => Promise<import("@/lib/providers/snapshot-values").SnapshotReference[] | undefined>
  signal?: AbortSignal
  fetchTitleMetadata: (input: TitleMetadataInput) => Promise<{
    error: string | null
    metadata: {
      externalId: string
      snapshotReferences?: import("@/lib/providers/snapshot-values").SnapshotReference[]
      parts?: ProviderTitlePart[]
      facts: Record<string, unknown>
      provider: string
      sourceUrl: string | null
    } | null
  }>
  searchTitles: (input: TitleSearchInput) => Promise<{
    candidates: MediaTitleCandidate[]
    error: string | null
  }>
}

export type MetadataJobStore = {
  logProviderFailure: (input: {
    action: "media.metadata-backfill.failed" | "media.metadata-refresh.failed"
    error: string
    item: MetadataJobItem
  }) => Promise<void>
  markAttempt: (mediaItemId: number, issueCode: MetadataIssueCode | null) => Promise<void>
  upsert: (input: {
    expectedSource?: {provider:string|null;externalId:string|null}
    snapshotReferences?: import("@/lib/providers/snapshot-values").SnapshotReference[]
    parts?: ProviderTitlePart[]
    facts: Record<string, unknown>
    mediaItemId: number
    sourceExternalId: string | null
    sourceProvider: string | null
    sourceUrl: string | null
  }) => Promise<unknown>
}

type ItemOutcome =
  | { kind: "quota-stop"; error: "provider-daily-limit" | "rate-limit-unavailable" }
  | { kind: "retryable"; error: string }
  | { kind: "skip"; issue: MetadataIssueCode }
  | { kind: "updated" }

export function isMetadataQuotaStopError(
  error: string | null | undefined,
): error is "provider-daily-limit" | "rate-limit-unavailable" {
  return Boolean(error && (METADATA_QUOTA_STOP_ERRORS as readonly string[]).includes(error))
}

function emptyJobResult(): MetadataJobResult {
  return {
    failed: 0,
    retryableFailed: 0,
    skipped: 0,
    updated: 0,
    updatedItems: [],
  }
}

function hasKnownMetadataSource(item: MetadataJobItem) {
  return Boolean(item.sourceProvider?.trim() && item.sourceExternalId?.trim())
}

function toMatchInput(item: MetadataJobItem) {
  return {
    originalTitle: item.originalTitle ?? "",
    platformCode: item.mediaType === "game" ? item.platformCode : null,
    releaseYear: item.releaseYear == null ? "" : String(item.releaseYear),
    title: item.title,
  }
}

async function fetchAndStoreMetadata(input: {
  context: MetadataJobContext
  externalId: string
  item: MetadataJobItem
  provider: string
  store: MetadataJobStore
}): Promise<ItemOutcome> {
  if (!isCoverProviderCode(input.provider) || !isMediaTypeCode(input.item.mediaType)) {
    return { kind: "skip", issue: "unsupported-source" }
  }

  const externalId = normalizeMetadataExternalId(input.provider, input.externalId)
  if (!externalId) return { kind: "skip", issue: "unsupported-source" }

  input.context.signal?.throwIfAborted()
  const result = await input.context.fetchTitleMetadata({
    externalId,
    mediaType: input.item.mediaType,
    provider: input.provider,
  })

  input.context.signal?.throwIfAborted()
  if (isMetadataQuotaStopError(result.error)) return { kind: "quota-stop", error: result.error }

  if (result.error === "provider-unavailable" || result.error === "provider-rate-limit") {
    return { kind: "retryable", error: result.error }
  }

  if (!result.metadata || (Object.keys(result.metadata.facts).length === 0 && !((input.item.mediaType === "film" || input.item.mediaType === "series") && input.provider === "tmdb" && result.metadata.snapshotReferences?.length))) {
    return { kind: "skip", issue: result.error ? "provider-error" : "no-provider-metadata" }
  }

  await input.store.upsert({
    parts: result.metadata.parts,
    snapshotReferences: result.metadata.snapshotReferences,
    expectedSource:{provider:input.item.sourceProvider,externalId:input.item.sourceExternalId},
    facts: result.metadata.facts,
    mediaItemId: input.item.id,
    sourceExternalId: result.metadata.externalId,
    sourceProvider: result.metadata.provider,
    sourceUrl: result.metadata.sourceUrl,
  })
  input.context.signal?.throwIfAborted()
  await input.store.markAttempt(input.item.id, null)
  return { kind: "updated" }
}

async function matchAndStoreMetadata(input: {
  context: MetadataJobContext
  item: MetadataJobItem
  store: MetadataJobStore
}): Promise<ItemOutcome> {
  if (!isMediaTypeCode(input.item.mediaType)) return { kind: "skip", issue: "unsupported-source" }

  input.context.signal?.throwIfAborted()
  const search = await input.context.searchTitles({
    mediaType: input.item.mediaType,
    query: input.item.title,
  })

  input.context.signal?.throwIfAborted()
  if (search.candidates.length === 0) {
    if (isMetadataQuotaStopError(search.error)) return { kind: "quota-stop", error: search.error }
    if (search.error === "provider-unavailable" || search.error === "provider-rate-limit") {
      return { kind: "retryable", error: search.error }
    }
    return { kind: "skip", issue: search.error ? "provider-error" : "no-candidates" }
  }

  const match = explainMetadataMatch(search.candidates, toMatchInput(input.item))
  if (!match.candidate) return { kind: "skip", issue: match.issue }

  return fetchAndStoreMetadata({
    context: input.context,
    externalId: match.candidate.externalId,
    item: input.item,
    provider: match.candidate.provider,
    store: input.store,
  })
}

async function applyItemOutcome(input: {
  action: "media.metadata-backfill.failed" | "media.metadata-refresh.failed"
  item: MetadataJobItem
  outcome: ItemOutcome
  result: MetadataJobResult
  store: MetadataJobStore
}) {
  if (input.outcome.kind === "quota-stop") {
    input.result.stopError = input.outcome.error
    return "stop" as const
  }

  if (input.outcome.kind === "updated") {
    input.result.updated += 1
    input.result.updatedItems.push({ id: input.item.id, title: input.item.title })
    return "continue" as const
  }

  if (input.outcome.kind === "retryable") {
    input.result.failed += 1
    input.result.retryableFailed += 1
    await input.store.markAttempt(input.item.id, "provider-error")
    await input.store.logProviderFailure({
      action: input.action,
      error: input.outcome.error,
      item: input.item,
    })
    return "continue" as const
  }

  input.result.skipped += 1
  await input.store.markAttempt(input.item.id, input.outcome.issue)
  return "continue" as const
}

export async function runMetadataBackfill(input: {
  signal?: AbortSignal
  context: MetadataJobContext
  items: readonly MetadataJobItem[]
  store: MetadataJobStore
}): Promise<MetadataJobResult> {
  const result = emptyJobResult()
  const context = {
    ...input.context,
    signal: input.signal && input.context.signal
      ? AbortSignal.any([input.signal, input.context.signal])
      : input.signal ?? input.context.signal,
  }

  for (const item of input.items) {
    context.signal?.throwIfAborted()
    const outcome = hasKnownMetadataSource(item)
      ? await fetchAndStoreMetadata({
          context,
          externalId: item.sourceExternalId!,
          item,
          provider: item.sourceProvider!,
          store: input.store,
        })
      : await matchAndStoreMetadata({
          context,
          item,
          store: input.store,
        })

    context.signal?.throwIfAborted()
    if (await applyItemOutcome({
      action: "media.metadata-backfill.failed",
      item,
      outcome,
      result,
      store: input.store,
    }) === "stop") {
      break
    }
  }

  return result
}

export async function runMetadataRefresh(input: {
  signal?: AbortSignal
  context: MetadataJobContext
  items: readonly MetadataJobItem[]
  store: MetadataJobStore
}): Promise<MetadataJobResult> {
  const result = emptyJobResult()
  const context = {
    ...input.context,
    signal: input.signal && input.context.signal
      ? AbortSignal.any([input.signal, input.context.signal])
      : input.signal ?? input.context.signal,
  }

  for (const item of input.items) {
    context.signal?.throwIfAborted()
    const outcome = hasKnownMetadataSource(item)
      ? await fetchAndStoreMetadata({
          context,
          externalId: item.sourceExternalId!,
          item,
          provider: item.sourceProvider!,
          store: input.store,
        })
      : { kind: "skip" as const, issue: "unsupported-source" as const }

    context.signal?.throwIfAborted()
    if (await applyItemOutcome({
      action: "media.metadata-refresh.failed",
      item,
      outcome,
      result,
      store: input.store,
    }) === "stop") {
      break
    }
  }

  return result
}
