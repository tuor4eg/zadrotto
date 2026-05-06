export const AUTHOR_PERMISSIONS = ["publish_media_without_review"] as const;

export type AuthorPermission = (typeof AUTHOR_PERMISSIONS)[number];

export const PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION: AuthorPermission =
  "publish_media_without_review";

export const AUTHOR_PERMISSION_LABELS: Record<AuthorPermission, string> = {
  publish_media_without_review: "Может публиковать тайтлы без проверки",
};

export function isAuthorPermission(value: string): value is AuthorPermission {
  return AUTHOR_PERMISSIONS.some((permission) => permission === value);
}
