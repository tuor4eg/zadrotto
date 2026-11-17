import type { Metadata } from "next";

export const SITE_DESCRIPTION = "Гикотека — личный архив фильмов, игр, книг, комиксов и других произведений. Ставь оценки, пиши рецензии, собирай подборки и следи за сериями.";

export const NO_INDEX_METADATA: Metadata = { robots: { index: false, follow: true } };

export type SeoSearchParams = Record<string, string | string[] | undefined>;

/** Relative metadata URLs are resolved by the root metadataBase from SITE_URL. */
export function buildPublicPageMetadata(
  path: string,
  title: string,
  description: string,
  imageUrl?: string | null,
): Metadata {
  const images = imageUrl ? [imageUrl] : [];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Гикотека", locale: "ru_RU", title, description, url: path, images },
    twitter: { card: imageUrl ? "summary_large_image" : "summary", title, description, images },
  };
}

function pagination(params: SeoSearchParams) {
  const raw = params.page;
  if (raw === undefined) return { valid: true, page: 1 };
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return { valid: false, page: 1 };
  const page = Number(raw);
  return { valid: Number.isSafeInteger(page), page };
}

function withPage(path: string, page: number) {
  return page > 1 ? `${path}${path.includes("?") ? "&" : "?"}page=${page}` : path;
}

/** Use the catalogue's resolved page so clamped results never create indexable duplicates. */
export function getPaginationRedirect(path: string, params: SeoSearchParams, resolvedPage: number): string | null {
  if (params.page === undefined || params.page === String(resolvedPage)) return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const part of Array.isArray(value) ? value : [value]) query.append(key, part);
  }
  if (resolvedPage > 1) query.set("page", String(resolvedPage));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

export function buildListingMetadata(path: string, title: string, description: string, params: SeoSearchParams): Metadata {
  const { valid, page } = pagination(params);
  const indexable = valid && Object.keys(params).every(key => params[key] === undefined || key === "page");
  const metadata = buildPublicPageMetadata(
    indexable ? withPage(path, page) : path,
    indexable && page > 1 ? `${title} — страница ${page}` : title,
    description,
  );
  return indexable ? metadata : { ...metadata, ...NO_INDEX_METADATA };
}

export function buildArchivePageMetadata(params: SeoSearchParams, entityMetadata: Metadata): Metadata {
  const entityKinds = ["series", "genre", "platform", "creator"];
  const selectedKinds = entityKinds.filter(kind => params[kind] !== undefined);
  const entityCanonical = entityMetadata.alternates?.canonical;
  const selectedValue = selectedKinds.length === 1 ? params[selectedKinds[0]] : undefined;
  const hasEntity = typeof selectedValue === "string" && selectedValue.trim().length > 0 && typeof entityCanonical === "string";
  const { valid, page } = pagination(params);
  const indexable = valid
    && (selectedKinds.length === 0 || hasEntity)
    && Object.keys(params).every(key => params[key] === undefined || key === "page" || (hasEntity && key === selectedKinds[0]));
  const path = hasEntity ? entityCanonical : "/archive";
  const title = typeof entityMetadata.title === "string" ? entityMetadata.title : "Архив фильмов, игр, книг и комиксов";
  const description = entityMetadata.description ?? "Каталог произведений в Гикотеке: фильмы, игры, книги, комиксы и другие записи с оценками и рецензиями.";
  const canonical = indexable ? withPage(path, page) : path;
  const pageTitle = indexable && page > 1 ? `${title} — страница ${page}` : title;
  return {
    ...buildPublicPageMetadata(canonical, pageTitle, description),
    openGraph: { ...entityMetadata.openGraph, type: "website", siteName: "Гикотека", locale: "ru_RU", title: pageTitle, description, url: canonical },
    twitter: { card: "summary", ...entityMetadata.twitter, title: pageTitle, description },
    ...(indexable ? {} : NO_INDEX_METADATA),
  };
}
