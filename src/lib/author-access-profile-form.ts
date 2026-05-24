const BYTES_IN_MEGABYTE = 1024 * 1024;

export type AuthorAccessProfileFormInput = {
  name: string;
  canPublishMediaWithoutReview: boolean;
  maxDraftMediaItems: number | null;
  maxUploadBytes: number | null;
  maxFilesPerMediaItem: number | null;
};

function parseOptionalPositiveInteger(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return { ok: true as const, value: null };
  }

  if (!/^\d+$/.test(normalizedValue)) {
    return { ok: false as const };
  }

  const parsedValue = Number(normalizedValue);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? { ok: true as const, value: parsedValue }
    : { ok: false as const };
}

export function parseAuthorAccessProfileFormInput(input: {
  name: string;
  canPublishMediaWithoutReview: string;
  maxDraftMediaItems: string;
  maxUploadMegabytes: string;
  maxFilesPerMediaItem: string;
}) {
  const name = input.name.trim();
  const maxDraftMediaItems = parseOptionalPositiveInteger(input.maxDraftMediaItems);
  const maxUploadMegabytes = parseOptionalPositiveInteger(input.maxUploadMegabytes);
  const maxFilesPerMediaItem = parseOptionalPositiveInteger(input.maxFilesPerMediaItem);

  if (!name) {
    return { ok: false as const, error: "required" };
  }

  if (!maxDraftMediaItems.ok || !maxUploadMegabytes.ok || !maxFilesPerMediaItem.ok) {
    return { ok: false as const, error: "invalid-limit" };
  }

  const maxUploadBytes =
    maxUploadMegabytes.value === null
      ? null
      : maxUploadMegabytes.value * BYTES_IN_MEGABYTE;

  if (maxUploadBytes !== null && !Number.isSafeInteger(maxUploadBytes)) {
    return { ok: false as const, error: "invalid-limit" };
  }

  return {
    ok: true as const,
    value: {
      name,
      canPublishMediaWithoutReview: input.canPublishMediaWithoutReview === "1",
      maxDraftMediaItems: maxDraftMediaItems.value,
      maxUploadBytes,
      maxFilesPerMediaItem: maxFilesPerMediaItem.value,
    } satisfies AuthorAccessProfileFormInput,
  };
}

export function formatUploadLimitMegabytes(maxUploadBytes: number | null) {
  if (maxUploadBytes === null) {
    return "";
  }

  return String(Math.floor(maxUploadBytes / BYTES_IN_MEGABYTE));
}
