import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = "scrypt:v1";
const PASSWORD_KEY_LENGTH = 64;
const DUMMY_PASSWORD_HASH = "scrypt:v1:S_8OA4curzpgyASOa3tv3w:e9Xo6fQA1_jKlZ1W7LRgBX7Y779if5_SrfUhLGu4sBPAYOgNqS8UBQi1WFxFHPhMFHLtxFKnS2Sw-WVajDmLWA";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;

  return `${PASSWORD_HASH_PREFIX}:${salt}:${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, version, salt, storedHash] = passwordHash.split(":");

  if (`${algorithm}:${version}` !== PASSWORD_HASH_PREFIX || !salt || !storedHash) {
    return false;
  }

  const storedKey = Buffer.from(storedHash, "base64url");
  const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

export async function verifyPasswordOrDummy(password: string, passwordHash?: string | null) {
  return verifyPassword(password, passwordHash ?? DUMMY_PASSWORD_HASH);
}
