export const AUTHOR_PASSWORD_MIN_LENGTH = 8;
export const AUTHOR_PASSWORD_MAX_LENGTH = 128;
export const AUTHOR_LOGIN_MAX_LENGTH = 64;
export const AUTHOR_EMAIL_MAX_LENGTH = 254;

export function normalizeAuthorLogin(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ru-RU");
}

export function normalizeAuthorEmail(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function isValidAuthorLogin(value: string) {
  const normalized = normalizeAuthorLogin(value);
  return normalized.length >= 2 && normalized.length <= AUTHOR_LOGIN_MAX_LENGTH;
}

export function isValidAuthorEmail(value: string) {
  const normalized = normalizeAuthorEmail(value);
  return normalized.length <= AUTHOR_EMAIL_MAX_LENGTH
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function validateAuthorPassword(password: string) {
  if (password.length < AUTHOR_PASSWORD_MIN_LENGTH) {
    return { ok: false as const, error: "too-short" as const };
  }

  if (password.length > AUTHOR_PASSWORD_MAX_LENGTH) {
    return { ok: false as const, error: "too-long" as const };
  }

  return { ok: true as const };
}
