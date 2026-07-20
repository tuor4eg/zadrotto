import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/opaque-token";

export function generateAuthorAuthChallengeToken() {
  return generateOpaqueToken("zac");
}

export function hashAuthorAuthChallengeToken(token: string) {
  return hashOpaqueToken(token);
}
