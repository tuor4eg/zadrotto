export const AUTHOR_DISPLAY_NAME_MAX_LENGTH = 80;

export function normalizeAuthorDisplayName(value: string) {
  const name = value.trim();

  return name && name.length <= AUTHOR_DISPLAY_NAME_MAX_LENGTH ? name : null;
}
