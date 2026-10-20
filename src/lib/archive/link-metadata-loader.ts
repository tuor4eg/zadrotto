import { getPublishedFranchiseIdentityByCode } from "@/db/queries/franchises";
import { getActiveGenreBySlug } from "@/db/queries/genres";
import { getActivePlatformBySlug } from "@/db/queries/platforms";
import { getCreatorLinkIdentityBySlug } from "@/db/queries/creators";
import { resolveCreatorAvatarUrl } from "@/lib/creators/avatar-url";
import { buildArchiveLinkMetadata, selectArchiveLinkTarget, type ArchiveLinkKind } from "./link-metadata";

const loaders = { getPublishedFranchiseIdentityByCode, getActiveGenreBySlug, getActivePlatformBySlug, getCreatorLinkIdentityBySlug };

export async function getArchiveLinkMetadata(params: Partial<Record<ArchiveLinkKind, unknown>>, dependencies = loaders) {
  const target = selectArchiveLinkTarget(params);
  if (!target) return {};
  const { kind, key } = target;
  if (kind === "series") {
    const row = await dependencies.getPublishedFranchiseIdentityByCode(key);
    return buildArchiveLinkMetadata(row ? { kind, key: row.code, name: row.title } : null);
  }
  if (kind === "genre") {
    const row = await dependencies.getActiveGenreBySlug(key);
    return buildArchiveLinkMetadata(row ? { kind, key: row.slug, name: row.name } : null);
  }
  if (kind === "platform") {
    const row = await dependencies.getActivePlatformBySlug(key);
    return buildArchiveLinkMetadata(row ? { kind, key: row.slug, name: row.name, imageUrl: row.logoUrl } : null);
  }
  const row = await dependencies.getCreatorLinkIdentityBySlug(key);
  return buildArchiveLinkMetadata(row ? { kind, key: row.slug, name: row.name, imageUrl: resolveCreatorAvatarUrl(row.avatarObjectKey) } : null);
}
