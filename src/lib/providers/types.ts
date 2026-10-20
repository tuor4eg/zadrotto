export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

export type SnapshotDescriptor = {
  providerCode: string;
  resourceType: string;
  externalId: string;
  apiMethod: string;
  requestParams: Record<string, JSONValue>;
};

export type RawSnapshot = SnapshotDescriptor & {
  id?: number;
  payload: JSONValue;
  contentType: string;
  payloadHash: string;
  requestStartedAt: Date;
  fetchedAt: Date;
};

export type BookProviderCode = "fantlab" | "google-books" | "open-library";
export type ProviderContributor = {
  name: string;
  externalId: string | null;
  roleCode: "writer" | "publisher";
  position: number;
};

export type BookProjection = {
  provider: BookProviderCode;
  externalId: string;
  sourceUrl: string;
  contributors: ProviderContributor[];
  contributorsComplete: boolean;
  fields: { title?: string; originalTitle?: string | null; releaseYear?: number | null; description?: string | null };
  diagnostics: string[];
};
