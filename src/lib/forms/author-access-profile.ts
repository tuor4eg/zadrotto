const BYTES_IN_MEGABYTE = 1024 * 1024;

export type AuthorAccessProfileFormInput = {
  name: string;
  canPublishMediaWithoutReview: boolean;
  maxDraftMediaItems: number | null;
  maxDraftMediaItemsPerDay: number | null;
  maxUploadBytes: number | null;
  maxFilesPerMediaItem: number | null;
  coverSearchesPerMinute: number | null;
  coverSearchesPerHour: number | null;
  coverSearchesPerDay: number | null;
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
  maxDraftMediaItemsPerDay: string;
  maxUploadMegabytes: string;
  maxFilesPerMediaItem: string;
  coverSearchesPerMinute: string;
  coverSearchesPerHour: string;
  coverSearchesPerDay: string;
}) {
  const name = input.name.trim();
  const maxDraftMediaItems = parseOptionalPositiveInteger(input.maxDraftMediaItems);
  const maxDraftMediaItemsPerDay = parseOptionalPositiveInteger(input.maxDraftMediaItemsPerDay);
  const maxUploadMegabytes = parseOptionalPositiveInteger(input.maxUploadMegabytes);
  const maxFilesPerMediaItem = parseOptionalPositiveInteger(input.maxFilesPerMediaItem);
  const coverSearchesPerMinute = parseOptionalPositiveInteger(input.coverSearchesPerMinute);
  const coverSearchesPerHour = parseOptionalPositiveInteger(input.coverSearchesPerHour);
  const coverSearchesPerDay = parseOptionalPositiveInteger(input.coverSearchesPerDay);

  if (!name) {
    return { ok: false as const, error: "required" };
  }

  if (
    !maxDraftMediaItems.ok ||
    !maxDraftMediaItemsPerDay.ok ||
    !maxUploadMegabytes.ok ||
    !maxFilesPerMediaItem.ok ||
    !coverSearchesPerMinute.ok ||
    !coverSearchesPerHour.ok ||
    !coverSearchesPerDay.ok
  ) {
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
      maxDraftMediaItemsPerDay: maxDraftMediaItemsPerDay.value,
      maxUploadBytes,
      maxFilesPerMediaItem: maxFilesPerMediaItem.value,
      coverSearchesPerMinute: coverSearchesPerMinute.value,
      coverSearchesPerHour: coverSearchesPerHour.value,
      coverSearchesPerDay: coverSearchesPerDay.value,
    } satisfies AuthorAccessProfileFormInput,
  };
}

export function formatUploadLimitMegabytes(maxUploadBytes: number | null) {
  if (maxUploadBytes === null) {
    return "";
  }

  return String(Math.floor(maxUploadBytes / BYTES_IN_MEGABYTE));
}
