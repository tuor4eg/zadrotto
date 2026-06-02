export type MediaType = string;

export type MediaTypeOption = {
  code: MediaType;
  name: string;
  description: string | null;
};

export type MediaTypeCount = {
  count: number;
  mediaType: MediaType;
};

const OTHER_MEDIA_TYPE_CODE = "other";

export function isMediaTypeCode(value: string | null | undefined): value is MediaType {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function getMediaTypeLabel(
  mediaType: MediaType,
  mediaTypes: readonly MediaTypeOption[],
) {
  const type = mediaTypes.find((item) => item.code === mediaType);

  if (!type) {
    throw new Error(`Unknown media type: ${mediaType}`);
  }

  return type.name;
}

export function sortMediaTypesByCount<T extends { code: MediaType; name?: string }>(
  mediaTypes: readonly T[],
  counts: readonly MediaTypeCount[],
) {
  const countByMediaType = new Map(counts.map((item) => [item.mediaType, item.count]));

  return [...mediaTypes].sort((left, right) => {
    if (left.code === OTHER_MEDIA_TYPE_CODE && right.code !== OTHER_MEDIA_TYPE_CODE) {
      return 1;
    }

    if (right.code === OTHER_MEDIA_TYPE_CODE && left.code !== OTHER_MEDIA_TYPE_CODE) {
      return -1;
    }

    const countDifference =
      (countByMediaType.get(right.code) ?? 0) - (countByMediaType.get(left.code) ?? 0);

    if (countDifference !== 0) {
      return countDifference;
    }

    return (left.name ?? left.code).localeCompare(right.name ?? right.code, "ru");
  });
}
