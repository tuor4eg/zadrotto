import assert from "node:assert/strict";
import { test } from "node:test";
import { getCoverProviderDefaultSettings, COVER_PROVIDER_LABELS } from "../src/lib/covers/provider-settings";
import { isCoverProviderCode } from "../src/lib/covers/types";
import { getMediaMetadataRefreshSource, normalizeMetadataExternalId } from "../src/lib/media/metadata-refresh-source";
import { getMediaCarrierFrame } from "../src/lib/media/carrier-frame";
import { getMediaItemSummaryParts } from "../src/lib/media/media-item-summary";
import { parseSnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";

test("manga uses MangaUpdates in shared provider settings and refresh", () => {
  assert.equal(isCoverProviderCode("mangaupdates"), true);
  assert.equal(COVER_PROVIDER_LABELS.mangaupdates, "MangaUpdates");
  assert.deepEqual(getCoverProviderDefaultSettings().filter(value => value.mediaType === "manga"), [{ mediaType: "manga", providerCode: "mangaupdates", enabled: true, titleSearchMode: "parallel", coverSearchEnabled: true, priority: 10 }]);
  assert.deepEqual(getMediaMetadataRefreshSource({ mediaType: "manga", metadata: { sourceProvider: "mangaupdates", sourceExternalId: "123" } }), { mediaType: "manga", provider: "mangaupdates", externalId: "123" });
  assert.equal(normalizeMetadataExternalId("mangaupdates", "series:123"), "123");
  assert.equal(normalizeMetadataExternalId("mangaupdates", "abc123"), null);
});
test("manga has neutral cover and ignores unrelated legacy labels", () => {
  assert.equal(getMediaCarrierFrame({ mediaType: "manga", mediaCarrierCode: null }), null);
  assert.deepEqual(getMediaItemSummaryParts({ mediaType: "manga", mediaTypeLabel: "Манга", releaseYear: 2020, metadataFacts: { status: "Завершена", type: "Manhwa", chapters: 100, volumes: 10 } }), ["Манга", "2020"]);
});
test("manga snapshot jobs accept only the MangaUpdates media source", () => {
  for (const operation of ["refresh", "process", "refresh-process", "verify"]) {
    assert.equal(parseSnapshotJobPayload({ operation, mediaType: "manga", provider: "mangaupdates" }).provider, "mangaupdates");
  }
  assert.throws(() => parseSnapshotJobPayload({ operation: "refresh", mediaType: "manga", provider: "anilist" }));
  assert.throws(() => parseSnapshotJobPayload({ operation: "refresh", mediaType: "book", provider: "mangaupdates" }));
  assert.throws(() => parseSnapshotJobPayload({ operation: "refresh", entityType: "creator", provider: "mangaupdates" }));
});

