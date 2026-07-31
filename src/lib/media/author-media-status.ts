export const AUTHOR_MEDIA_STATUSES = ["wanted", "skipped"] as const;

export type AuthorMediaStatus = (typeof AUTHOR_MEDIA_STATUSES)[number];

export function isAuthorMediaStatus(value: string): value is AuthorMediaStatus {
  return AUTHOR_MEDIA_STATUSES.some((status) => status === value);
}
