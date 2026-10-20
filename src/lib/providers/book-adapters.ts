import type { BookProjection, BookProviderCode, JSONValue, ProviderContributor, RawSnapshot, SnapshotDescriptor } from "./types";

export class InvalidProviderSnapshotError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidProviderSnapshotError"; }
}

export class OpenLibraryWorkRedirectError extends InvalidProviderSnapshotError {
  constructor(readonly targetExternalId: string) {
    super("Open Library work was merged into another record.");
    this.name = "OpenLibraryWorkRedirectError";
  }
}

const record = (value: JSONValue | undefined): Record<string, JSONValue> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value: JSONValue | undefined): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const positiveId = (value: JSONValue | undefined): string | null => typeof value === "number" || typeof value === "string" ? (/^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? String(Number(value)) : null) : null;
const releaseYear = (value: JSONValue | undefined): number | undefined => {
  const id = positiveId(value);
  const year = id ? Number(id) : 0;
  return year >= 1000 && year <= 9999 ? year : undefined;
};
const publicationYear = (value: JSONValue | undefined): number | undefined => {
  const match = text(value)?.match(/\b(\d{4})\b/);
  return match ? releaseYear(match[1]) : undefined;
};

export function describeBookSource(provider: BookProviderCode, externalId: string): SnapshotDescriptor {
  if (!["fantlab", "google-books", "open-library"].includes(provider)) throw new InvalidProviderSnapshotError("Unsupported book provider.");
  let id = externalId.trim();
  if (provider === "fantlab") {
    id = positiveId(id) ?? "";
    if (!id) throw new InvalidProviderSnapshotError("Invalid FantLab work ID.");
    return { providerCode: provider, resourceType: "work", externalId: id, apiMethod: "search-ids", requestParams: { w: id } };
  }
  if (provider === "google-books") {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new InvalidProviderSnapshotError("Invalid Google Books volume ID.");
    return { providerCode: provider, resourceType: "volume", externalId: id, apiMethod: "volumes.get", requestParams: {} };
  }
  if (!/^\/works\/OL[1-9]\d*W$/.test(id)) throw new InvalidProviderSnapshotError("Invalid Open Library work ID.");
  return { providerCode: provider, resourceType: "work", externalId: id, apiMethod: "works.get", requestParams: {} };
}

function primaryRecord(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  if (snapshot.providerCode === "fantlab") {
    const works = Array.isArray(snapshot.payload) ? snapshot.payload : record(snapshot.payload)?.works;
    const work = Array.isArray(works) ? works.map(record).find((item) => item && positiveId(item.id ?? item.work_id ?? item.doc) === snapshot.externalId) : null;
    if (!work) throw new InvalidProviderSnapshotError("FantLab response does not contain the requested work.");
    return work;
  }
  const item = record(snapshot.payload);
  const identity = snapshot.providerCode === "google-books" ? item?.id : item?.key;
  if (!item || identity !== snapshot.externalId) throw new InvalidProviderSnapshotError("Provider response identity does not match the request.");
  if (snapshot.providerCode === "google-books" && !record(item.volumeInfo)) throw new InvalidProviderSnapshotError("Google Books volumeInfo is missing.");
  return item;
}

export function getBookDependencyDescriptors(primary: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">): SnapshotDescriptor[] {
  const item = primaryRecord(primary);
  if (primary.providerCode !== "open-library") return [];
  if (record(item.type)?.key === "/type/redirect") {
    const target = text(item.location);
    if (!target || !/^\/works\/OL[1-9]\d*W$/.test(target) || target === primary.externalId) throw new InvalidProviderSnapshotError("Invalid Open Library redirect.");
    throw new OpenLibraryWorkRedirectError(target);
  }
  if (!Array.isArray(item.authors)) return [];
  const keys = item.authors.map((entry) => text(record(record(entry)?.author)?.key));
  if (keys.some((key) => !key || !/^\/authors\/OL[1-9]\d*A$/.test(key))) throw new InvalidProviderSnapshotError("Open Library contains an invalid author reference.");
  return [...new Set(keys as string[])].map((key) => ({ providerCode: "open-library", resourceType: "author", externalId: key, apiMethod: "authors.get", requestParams: {} }));
}

export function normalizeBookSnapshots(primary: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">, dependencies: Pick<RawSnapshot, "providerCode" | "externalId" | "payload" | "resourceType">[] = []): BookProjection {
  const provider = primary.providerCode as BookProviderCode;
  describeBookSource(provider, primary.externalId);
  const item = primaryRecord(primary);
  const contributors: ProviderContributor[] = [];
  let complete = true;
  const add = (name: string | null, externalId: string | null = null) => {
    if (!name) { complete = false; return; }
    if (!contributors.some((entry) => externalId ? entry.externalId === externalId : entry.name === name)) contributors.push({ name, externalId, roleCode: "writer", position: contributors.length });
  };
  let fields: BookProjection["fields"] = {};
  let sourceUrl: string;
  if (provider === "fantlab") {
    const creators = record(item.creators);
    const lists = [creators?.authors, item.authors].filter(Array.isArray);
    complete = lists.length > 0;
    for (const entry of lists.flat()) {
      const author = record(entry);
      if (author?.type === "autor" && !positiveId(author.id)) complete = false;
      add(text(author?.name), author?.type === "autor" ? positiveId(author.id) : null);
    }
    fields = {
      title: text(item.name ?? item.work_name ?? item.title) ?? undefined,
      originalTitle: text(item.name_orig ?? item.work_name_orig),
      releaseYear: releaseYear(item.year) ?? releaseYear(item.work_year),
      description: text(item.description) ?? undefined,
    };
    sourceUrl = `https://fantlab.ru/work${primary.externalId}`;
  } else if (provider === "google-books") {
    const info = record(item.volumeInfo)!;
    complete = Array.isArray(info.authors);
    if (Array.isArray(info.authors)) info.authors.forEach((name) => add(text(name)));
    fields = {
      title: text(info.title) ?? undefined,
      originalTitle: text(info.subtitle) ?? undefined,
      releaseYear: publicationYear(info.publishedDate),
      description: text(info.description) ?? undefined,
    };
    sourceUrl = `https://books.google.com/books?id=${encodeURIComponent(primary.externalId)}`;
  } else {
    complete = Array.isArray(item.authors);
    for (const descriptor of getBookDependencyDescriptors(primary)) {
      const dependency = dependencies.find((entry) => entry.providerCode === provider && entry.resourceType === "author" && entry.externalId === descriptor.externalId);
      const author = dependency ? record(dependency.payload) : null;
      if (!author || author.key !== descriptor.externalId) { complete = false; continue; }
      add(text(author.name), descriptor.externalId);
    }
    fields = {
      title: text(item.title) ?? undefined,
      releaseYear: publicationYear(item.first_publish_date),
      description: text(item.description) ?? text(record(item.description)?.value) ?? undefined,
    };
    sourceUrl = `https://openlibrary.org${primary.externalId}`;
  }
  return { provider, externalId: primary.externalId, sourceUrl, contributors, contributorsComplete: complete, fields, diagnostics: complete ? [] : ["Сведения об авторах неполны; существующие связи сохранены."] };
}

export function buildBookSnapshotUrl(descriptor: SnapshotDescriptor, apiKey?: string): URL {
  const canonical = descriptor.resourceType === "author" && descriptor.providerCode === "open-library"
    ? (/^\/authors\/OL[1-9]\d*A$/.test(descriptor.externalId) ? { ...descriptor, apiMethod: "authors.get", requestParams: {} } : null)
    : describeBookSource(descriptor.providerCode as BookProviderCode, descriptor.externalId);
  if (!canonical || canonical.apiMethod !== descriptor.apiMethod || JSON.stringify(canonical.requestParams) !== JSON.stringify(descriptor.requestParams) || canonical.resourceType !== descriptor.resourceType) throw new InvalidProviderSnapshotError("Unsupported provider request descriptor.");
  if (descriptor.providerCode === "fantlab") { const url = new URL("https://api.fantlab.ru/search-ids"); url.searchParams.set("w", descriptor.externalId); return url; }
  if (descriptor.providerCode === "google-books") { const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(descriptor.externalId)}`); if (apiKey) url.searchParams.set("key", apiKey); return url; }
  return new URL(`https://openlibrary.org${descriptor.externalId}.json`);
}
