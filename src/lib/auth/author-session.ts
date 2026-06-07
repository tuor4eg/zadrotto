import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTHOR_SESSION_COOKIE_NAME = "author_session";
export const AUTHOR_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type AuthorSessionPayload = {
  type: "author";
  authorId: number;
  authorCode: string;
  iat: number;
  exp: number;
};

function getAuthorSessionSecret() {
  const secret = process.env.AUTHOR_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTHOR_SESSION_SECRET is not set");
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
  return createHmac("sha256", getAuthorSessionSecret()).update(content).digest("base64url");
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

function isAuthorSessionPayload(payload: unknown): payload is AuthorSessionPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybePayload = payload as Partial<AuthorSessionPayload>;

  return (
    maybePayload.type === "author" &&
    Number.isInteger(maybePayload.authorId) &&
    typeof maybePayload.authorCode === "string" &&
    maybePayload.authorCode.length > 0 &&
    typeof maybePayload.exp === "number" &&
    typeof maybePayload.iat === "number"
  );
}

export function createAuthorSessionToken(authorId: number, authorCode: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      type: "author",
      authorId,
      authorCode,
      iat: now,
      exp: now + AUTHOR_SESSION_MAX_AGE_SECONDS,
    } satisfies AuthorSessionPayload),
  );
  const content = `${header}.${payload}`;
  const signature = signJwtContent(content);

  return `${content}.${signature}`;
}

export function verifyAuthorSessionToken(token: string) {
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
      (decodedHeader as { alg?: unknown }).alg !== "HS256" ||
      !isAuthorSessionPayload(decodedPayload)
    ) {
      return null;
    }

    if (decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decodedPayload;
  } catch {
    return null;
  }
}
