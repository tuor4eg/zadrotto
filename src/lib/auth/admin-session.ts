import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type AdminSessionPayload = {
  type: "admin";
  adminId: number;
  sessionInvalidatedAt: number;
  iat: number;
  exp: number;
};

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not set");
  }

  return secret;
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64UrlJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function signJwtContent(content: string) {
  return createHmac("sha256", getAdminSessionSecret()).update(content).digest("base64url");
}

function isValidSignature(content: string, signature: string) {
  const expectedSignature = signJwtContent(content);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);

  return (
    expectedSignatureBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedSignatureBuffer, signatureBuffer)
  );
}

function normalizeAdminSessionPayload(payload: unknown): AdminSessionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybePayload = payload as Partial<AdminSessionPayload> & {
    sessionUpdatedAt?: unknown;
  };
  const adminId = maybePayload.adminId;
  const sessionInvalidatedAt =
    typeof maybePayload.sessionInvalidatedAt === "number"
      ? maybePayload.sessionInvalidatedAt
      : maybePayload.sessionUpdatedAt;

  if (
    maybePayload.type === "admin" &&
    typeof adminId === "number" &&
    Number.isInteger(adminId) &&
    typeof sessionInvalidatedAt === "number" &&
    Number.isInteger(sessionInvalidatedAt) &&
    typeof maybePayload.exp === "number" &&
    typeof maybePayload.iat === "number"
  ) {
    return {
      type: "admin",
      adminId,
      sessionInvalidatedAt,
      iat: maybePayload.iat,
      exp: maybePayload.exp,
    };
  }

  return null;
}

export function createAdminSessionToken(adminId: number, sessionInvalidatedAt: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      type: "admin",
      adminId,
      sessionInvalidatedAt,
      iat: now,
      exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
    } satisfies AdminSessionPayload),
  );
  const content = `${header}.${payload}`;
  const signature = signJwtContent(content);

  return `${content}.${signature}`;
}

export function verifyAdminSessionToken(token: string) {
  const [header, payload, signature] = token.split(".");

  try {
    if (!header || !payload || !signature || !isValidSignature(`${header}.${payload}`, signature)) {
      return null;
    }

    const decodedHeader = decodeBase64UrlJson(header);
    const decodedPayload = decodeBase64UrlJson(payload);

    if (
      !decodedHeader ||
      typeof decodedHeader !== "object" ||
      (decodedHeader as { alg?: unknown }).alg !== "HS256"
    ) {
      return null;
    }

    const normalizedPayload = normalizeAdminSessionPayload(decodedPayload);

    if (!normalizedPayload || normalizedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return normalizedPayload;
  } catch {
    return null;
  }
}
