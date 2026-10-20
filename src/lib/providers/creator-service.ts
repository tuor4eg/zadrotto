import { getFantlabAuthorRaw } from "@/lib/creators/fantlab-api";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { fantlabAuthorDescriptor, mapFantlabAuthorDates } from "./creator-adapters";

export async function getSavedCreatorSnapshot(externalId: string) {
  const snapshot = await getProviderSnapshot(fantlabAuthorDescriptor(externalId));
  if (!snapshot) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  mapFantlabAuthorDates(snapshot);
  return snapshot;
}

export async function fetchCreatorSnapshot(externalId: string, options: { signal: AbortSignal; jobGuard?: SnapshotJobGuard; reuseAfter?: Date }) {
  const descriptor = fantlabAuthorDescriptor(externalId);
  const saved = await getProviderSnapshot(descriptor);
  if (saved && options.reuseAfter && saved.requestStartedAt >= options.reuseAfter) {
    mapFantlabAuthorDates(saved);
    return saved;
  }
  let requestStartedAt: Date | undefined;
  const payload = await getFantlabAuthorRaw(externalId, options.signal, async () => { requestStartedAt = await providerRequestStartedAt(); });
  options.signal.throwIfAborted();
  mapFantlabAuthorDates({ ...descriptor, payload });
  return saveProviderSnapshot({ ...descriptor, payload, payloadHash: "", contentType: "application/json", requestStartedAt: requestStartedAt!, fetchedAt: new Date() }, options.jobGuard);
}
