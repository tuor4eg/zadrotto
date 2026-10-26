import { parseAniListPersonImage } from "./anilist-person-image";
import { creatorImageBindingFingerprint } from "./image-fingerprint";
import { createHash } from "node:crypto";
import { creatorImageBindingsQuery, creatorImageStateQuery, commitCreatorImage } from "@/db/queries/creator-image-commit";
import { attachCreatorProfileSnapshot } from "@/db/queries/creator-profile-snapshots";
import type { SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { fetchCreatorProfileSnapshot } from "@/lib/providers/creator-profile-service";
import { parseFantlabAuthor } from "./fantlab-api";
import { canWriteCreatorImage, creatorImageCandidates, type CreatorImageOutcome } from "./image-policy";
import type { CreatorProfileTarget } from "@/lib/providers/creator-profile-targets";
import type { JSONValue } from "@/lib/providers/types";
import { tmdbPersonPortraitUrl } from "./tmdb-person-avatar";
import { getTmdbCompanyLogoUrl } from "./tmdb-company-images";
import { fetchProviderImage } from "@/lib/covers/provider-image-relay";
import { AVATAR_MAX_BYTES } from "@/lib/avatars/config";
import { deleteCreatorAvatarBestEffort, transformCreatorAvatarBuffer, uploadProcessedCreatorAvatarBuffer } from "./avatar-storage";
import { transformCompanyLogo } from "./game-company-images";
import { JobError } from "@/lib/jobs/types";

/** Pure projection of an already validated full raw profile. */
export function creatorProfileImage(target: CreatorProfileTarget, payload: JSONValue) {
  if (target.provider === "anilist") return parseAniListPersonImage(payload, target.externalId);
  if (target.provider === "fantlab") {
    const author = parseFantlabAuthor(payload, target.externalId, { allowClosed: true });
    return { urls: [...new Set([author.imageUrl, author.previewUrl].filter((url): url is string => Boolean(url)))], sourceUrl: author.sourceUrl };
  }
  const row = payload as Record<string, JSONValue>;
  if (target.provider === "tmdb") {
    const url = target.resourceType === "person" ? tmdbPersonPortraitUrl(row.profile_path) : getTmdbCompanyLogoUrl(row.logo_path);
    if (!url && row[target.resourceType === "person" ? "profile_path" : "logo_path"] != null) throw new Error("INVALID_CREATOR_IMAGE");
    return { urls: url ? [url] : [], sourceUrl: `https://www.themoviedb.org/${target.resourceType}/${target.externalId}` };
  }
  const logo = row.logo && typeof row.logo === "object" && !Array.isArray(row.logo) ? row.logo : null;
  const imageId = logo?.image_id;
  if (imageId != null && (typeof imageId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(imageId))) throw new Error("INVALID_CREATOR_IMAGE");
  return { urls: imageId ? [`https://images.igdb.com/igdb/image/upload/t_original/${imageId}.png`] : [], sourceUrl: `https://www.igdb.com/companies/${typeof row.slug === 'string' && /^[a-z0-9-]+$/.test(row.slug) ? row.slug : target.externalId}` };
}
const discoverAnimeCompany: typeof import("./anime-company-logo-binding").ensureAnimeCompanyLogoBinding = async (...args) =>
  (await import("./anime-company-logo-binding")).ensureAnimeCompanyLogoBinding(...args);
const defaults = { state: creatorImageStateQuery, bindings: creatorImageBindingsQuery, fetchProfile: fetchCreatorProfileSnapshot, attach: attachCreatorProfileSnapshot,
  discoverCompany: discoverAnimeCompany, fetchImage: fetchProviderImage, portrait: transformCreatorAvatarBuffer, logo: transformCompanyLogo, upload: uploadProcessedCreatorAvatarBuffer, commit: commitCreatorImage, cleanup: deleteCreatorAvatarBestEffort };
export type CreatorImageDependencies = Partial<typeof defaults>;
/** Shared orchestration. No name lookup, field enrichment or network inside transactions. */
export async function fillCreatorImage(creatorId: number, signal: AbortSignal, options: { refreshBindingId?: number; refreshCompanySearch?: boolean; guard?: SnapshotJobGuard; checkpoint?: Record<string, unknown>; bindingFingerprint?: string; beforeRequest?: (provider: CreatorProfileTarget["provider"]) => Promise<void> } = {}, dependencies: CreatorImageDependencies = {}): Promise<CreatorImageOutcome> {
  const d = { ...defaults, ...dependencies };
  signal.throwIfAborted();
  const [state] = await d.state(creatorId);
  if (!state) return "source-changed";
  if (!options.refreshBindingId && !canWriteCreatorImage(state.creator)) return "already-present";
  let bindings = await d.bindings(creatorId);
  if (options.bindingFingerprint && creatorImageBindingFingerprint(bindings) !== options.bindingFingerprint) return "source-changed";
  if (!bindings.length) return "no-binding";
  if (!options.refreshBindingId && state.typeCode === "organization"
    && bindings.some(binding => binding.provider === "anilist" && binding.externalCreatorId.startsWith("studio:"))
    && (options.refreshCompanySearch || !creatorImageCandidates(state.typeCode, bindings).some(candidate => candidate.bindings.length))) {
    const discovery = await d.discoverCompany(creatorId, { signal, guard: options.guard, beforeRequest: options.beforeRequest, refresh: options.refreshCompanySearch });
    if (discovery.status !== "ready") return discovery.status === "pending" ? "ambiguous-binding" : discovery.status === "missing" ? "missing-image" : discovery.status === "source-changed" ? "source-changed" : "unsupported-source";
    bindings = await d.bindings(creatorId);
  }
  const selected = options.refreshBindingId ? bindings.find(binding => binding.id === options.refreshBindingId) : undefined;
  if (options.refreshBindingId && !selected) return "source-changed";
  if (selected && !canWriteCreatorImage(state.creator, selected)) return "already-present";
  const candidates = creatorImageCandidates(state.typeCode, selected ? [selected] : bindings);
  if (!candidates.some(c => c.bindings.length)) return "unsupported-source";
  for (const candidate of candidates) {
    if (!candidate.bindings.length) continue;
    if (!candidate.target) return "ambiguous-binding";
    const target = candidate.target;
    const binding = candidate.bindings[0];
    const snapshot = await d.fetchProfile(target, { signal, jobGuard: options.guard, onlyMissing: !options.refreshBindingId, beforeRequest: options.beforeRequest });
    await d.attach({ creatorId, bindingId: binding.id, ref: { id: snapshot.id, payloadHash: snapshot.payloadHash }, jobGuard: options.guard });
    const image = creatorProfileImage(target, snapshot.payload);
    if (!image.urls.length) continue;
    // A manual edit or another fill may have completed during profile acquisition.
    const [current] = await d.state(creatorId);
    if (!current || current.creator.avatarVersion !== state.creator.avatarVersion || !canWriteCreatorImage(current.creator, selected)) return "source-changed";
    let body: Buffer | undefined;
    let originalUrl = image.urls[0];
    for (const url of image.urls) {
      signal.throwIfAborted();
      const fetched = await d.fetchImage({ providerCode: target.provider, imageUrl: url, maxBytes: AVATAR_MAX_BYTES });
      signal.throwIfAborted();
      if (fetched.ok) { body = await (state.typeCode === "organization" ? d.logo(fetched.body) : d.portrait(fetched.body)); originalUrl = url; break; }
    }
    if (!body) throw new JobError("creator-image-unavailable", "Не удалось загрузить изображение создателя.");
    const contentHash = createHash("sha256").update(body).digest("hex");
    const uploaded = await d.upload({ creatorId, body });
    let committed = false;
    try {
      signal.throwIfAborted();
      committed = await d.commit({ creatorId, expectedVersion: state.creator.avatarVersion, typeCode: state.typeCode, binding, bindings, target,
        refresh: Boolean(options.refreshBindingId), snapshot: { id: snapshot.id, payloadHash: snapshot.payloadHash }, objectKey: uploaded.objectKey, contentHash,
        originalUrl, sourceUrl: image.sourceUrl, guard: options.guard, checkpoint: options.checkpoint });
      if (committed && state.creator.avatarObjectKey && state.creator.avatarObjectKey !== uploaded.objectKey) await d.cleanup(state.creator.avatarObjectKey);
      return committed ? "stored" : "source-changed";
    } finally { if (!committed) await d.cleanup(uploaded.objectKey); }
  }
  return "missing-image";
}
