import { type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import "server-only";

import { getArchiveSettings } from "@/db/queries/archive-settings";
import {
  applyAnimeShikimoriBackfillResult,
  getPendingAnimeShikimoriBackfillItems,
  markAnimeShikimoriBackfillSkipped,
} from "@/db/queries/anime-shikimori-backfill";
import { getCoverSettings } from "@/db/queries/cover-settings";
import {
  getAniListShikimoriEnrichment,
} from "@/lib/covers/providers/anilist";
import { runWithProviderRequestTimeout } from "@/lib/covers/provider-request-timeout";
import { runAnimeShikimoriBackfill } from "@/lib/media/anime-shikimori-backfill-core";

export async function backfillAnimeFromShikimori(jobGuard?: SnapshotJobGuard, signal?: AbortSignal) {
  const [archiveSettings, coverSettings] = await Promise.all([
    getArchiveSettings(),
    getCoverSettings(),
  ]);

  return runAnimeShikimoriBackfill({
    applyResult: input => { signal?.throwIfAborted(); return applyAnimeShikimoriBackfillResult({...input, jobGuard}); },
    fetchEnrichment: (anilistId) => { signal?.throwIfAborted(); return Promise.resolve(runWithProviderRequestTimeout(
      coverSettings.providerRequestTimeoutMs,
      () => getAniListShikimoriEnrichment(anilistId),
    )); },
    getItems: getPendingAnimeShikimoriBackfillItems,
    markSkipped: input => { signal?.throwIfAborted(); return markAnimeShikimoriBackfillSkipped({...input, jobGuard}); },
    maxTitleAliases: archiveSettings.maxTitleAliases,
  });
}
