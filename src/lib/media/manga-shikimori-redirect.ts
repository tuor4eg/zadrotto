import "server-only";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getActiveProviderRequestTimeoutMs, ProviderHttpError, withProviderTimeout } from "@/lib/covers/providers/shared";
import { mangaUpdatesLinkIdentity, mangaUpdatesRedirectTarget, shikimoriRetryAfterSeconds } from "./manga-shikimori-model";

/** Resolve only the official legacy endpoint; never follow arbitrary provider links. */
export async function resolveMangaUpdatesLegacyUrl(url: string, guard?: SnapshotJobGuard, signal?: AbortSignal) {
  const identity = mangaUpdatesLinkIdentity(url);
  if (!identity?.startsWith("legacy:")) return null;
  const externalId = identity.slice("legacy:".length);
  const legacyUrl = `https://www.mangaupdates.com/series.html?id=${externalId}`;
  const descriptor = { providerCode: "mangaupdates", resourceType: "series-redirect", externalId, apiMethod: "series.redirect", requestParams: { url: legacyUrl } };
  let snapshot = await getProviderSnapshot(descriptor);
  if (!snapshot) {
    const requestStartedAt = await providerRequestStartedAt();
    const response = await fetch(legacyUrl, { redirect: "manual", headers: { accept: "text/html", "user-agent": "Mozilla/5.0" }, signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), signal) });
    const location = response.headers.get("location");
    if (!response.ok && ![301, 302, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (response.status === 404 || response.status === 410) return null;
      throw Object.assign(new ProviderHttpError(response.status, null), { retryAfterSeconds: shikimoriRetryAfterSeconds(response.headers.get("retry-after")) });
    }
    let html: string | null = null;
    if (location) await response.body?.cancel();
    else {
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (reader) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("MANGAUPDATES_REDIRECT_TOO_LARGE"); }
          chunks.push(chunk.value);
        }
      } finally { reader?.releaseLock(); }
      html = Buffer.concat(chunks).toString("utf8");
    }
    const payload = { legacyUrl, location, html };
    if (!mangaUpdatesRedirectTarget(payload)) throw new Error("MANGAUPDATES_REDIRECT_UNRESOLVED");
    snapshot = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: "", contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, guard);
  }
  const target = mangaUpdatesRedirectTarget(snapshot.payload);
  return target ? { ...target, snapshot: { id: snapshot.id, payloadHash: snapshot.payloadHash } } : null;
}
