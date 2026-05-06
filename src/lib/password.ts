import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = "scrypt:v1";
const PASSWORD_KEY_LENGTH = 64;

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
