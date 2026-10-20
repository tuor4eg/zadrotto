import type { Metadata } from "next";

export type ArchiveLinkKind = "creator" | "platform" | "genre" | "series";
export type ArchiveLinkEntity = { kind: ArchiveLinkKind; name: string; key: string; imageUrl?: string | null };
const labels: Record<ArchiveLinkKind, string> = { creator: "Создатель", platform: "Платформа", genre: "Жанр", series: "Серия" };

/** A shared link identifies an entity, independent of personal archive filters. */
export function selectArchiveLinkTarget(params: Partial<Record<ArchiveLinkKind, unknown>>) {
  for (const kind of ["creator", "platform", "genre", "series"] as const) {
    const key = params[kind];
    if (typeof key === "string" && key.trim()) return { kind, key: key.trim() };
  }
  return null;
}

export function buildArchiveLinkMetadata(entity: ArchiveLinkEntity | null): Metadata {
  if (!entity) return {};
  const title = `${labels[entity.kind]}: ${entity.name}`;
  const description = `${title}. Записи в Гикотеке.`;
  const url = `/archive?${new URLSearchParams({ [entity.kind]: entity.key })}`;
  const images = entity.imageUrl ? [entity.imageUrl] : [];
  return {
    title, description, alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Гикотека", title, description, url, images },
    twitter: { card: entity.imageUrl ? "summary_large_image" : "summary", title, description, images },
  };
}
