import { fetchCreatorProfileRaw, validateCreatorProfilePayload } from "./creator-profile-fetch";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getCoverProviderCredentialsForSearch } from "@/db/queries/cover-settings";
import type { ProviderSearchOptions } from "@/lib/covers/types";
import { creatorProfileDescriptor, parseCreatorProfileTarget, type CreatorProfileTarget } from "./creator-profile-targets";

export async function getSavedCreatorProfileSnapshot(target: CreatorProfileTarget, executor?: Parameters<typeof getProviderSnapshot>[1]) {
  const snapshot = await getProviderSnapshot(creatorProfileDescriptor(target), executor);
  if (!snapshot) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  validateCreatorProfilePayload(target, snapshot.payload);
  return snapshot;
}
export type CreatorProfileFetchOptions = {
  signal: AbortSignal;
  jobGuard?: SnapshotJobGuard;
  reuseAfter?: Date;
  onlyMissing?: boolean;
  credentials?: ProviderSearchOptions["providerCredentials"];
  beforeRequest?: (provider: CreatorProfileTarget["provider"]) => Promise<void>;
};
/** Fetch and persist raw only. Domain application and linking belong to callers. */
export async function fetchCreatorProfileSnapshot(input: CreatorProfileTarget, options: CreatorProfileFetchOptions) {
  const target = parseCreatorProfileTarget(input);
  const descriptor = creatorProfileDescriptor(target);
  options.signal.throwIfAborted();
  const saved = await getProviderSnapshot(descriptor);
  if (saved && (options.onlyMissing || (options.reuseAfter && saved.requestStartedAt >= options.reuseAfter))) {
    validateCreatorProfilePayload(target, saved.payload);
    return saved;
  }
  const credentials = target.provider === "fantlab" ? options.credentials : options.credentials ?? await getCoverProviderCredentialsForSearch();
  const { payload, requestStartedAt } = await fetchCreatorProfileRaw(target, { ...options, credentials, requestStartedAt: providerRequestStartedAt });
  options.signal.throwIfAborted();
  validateCreatorProfilePayload(target, payload);
  return saveProviderSnapshot({ ...descriptor, payload, payloadHash: "", contentType: "application/json", requestStartedAt: requestStartedAt!, fetchedAt: new Date() }, options.jobGuard);
}
