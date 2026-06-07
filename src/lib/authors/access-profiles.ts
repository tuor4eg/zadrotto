export const AUTHOR_ACCESS_PROFILE_CODES = ["system", "regular", "trusted"] as const;

export type AuthorAccessProfileCode = (typeof AUTHOR_ACCESS_PROFILE_CODES)[number];

export const SYSTEM_AUTHOR_ACCESS_PROFILE_CODE: AuthorAccessProfileCode = "system";
export const REGULAR_AUTHOR_ACCESS_PROFILE_CODE: AuthorAccessProfileCode = "regular";
export const TRUSTED_AUTHOR_ACCESS_PROFILE_CODE: AuthorAccessProfileCode = "trusted";

export const AUTHOR_ACCESS_PROFILE_LABELS: Record<AuthorAccessProfileCode, string> = {
  system: "Системный",
  regular: "Обычный автор",
  trusted: "Доверенный автор",
};

export function isAuthorAccessProfileCode(value: string): value is AuthorAccessProfileCode {
  return AUTHOR_ACCESS_PROFILE_CODES.some((code) => code === value);
}

export function canAssignAuthorAccessProfile(input: { isSystem: boolean }) {
  return !input.isSystem;
}
