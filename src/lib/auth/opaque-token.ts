import { createHash, randomBytes } from "node:crypto";

export function generateOpaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
