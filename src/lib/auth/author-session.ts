import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/opaque-token";

export const AUTHOR_SESSION_COOKIE_NAME = "author_session_v2";
export const AUTHOR_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function generateAuthorSessionToken() {
  return generateOpaqueToken("zas");
}

export function hashAuthorSessionToken(token: string) {
  return hashOpaqueToken(token);
}
