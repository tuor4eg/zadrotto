import { createHash, randomBytes } from "node:crypto";

const AUTHOR_ACCESS_TOKEN_PREFIX = "zat";

export function generateAuthorAccessToken() {
  return `${AUTHOR_ACCESS_TOKEN_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashAuthorAccessToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}
