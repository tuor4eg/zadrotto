import { createHmac, timingSafeEqual } from "node:crypto";

import { COVER_PROVIDER_CODES, type MediaProviderCode } from "@/lib/covers/types";

const METADATA_CANDIDATE_TOKEN_MAX_AGE_SECONDS = 6 * 60 * 60;

export type MediaMetadataCandidateTokenPayload = {
  provider: MediaProviderCode;
  externalId: string;
  sourceUrl: string | null;
  facts: Record<string, unknown>;
  exp: number;
};

export type MediaMetadataCandidate = Omit<MediaMetadataCandidateTokenPayload, "exp">;

function getMediaMetadataCandidateSecret() {
  const secret =
    process.env.MEDIA_METADATA_CANDIDATE_SECRET?.trim() ||
    process.env.COVER_CANDIDATE_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.AUTHOR_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "MEDIA_METADATA_CANDIDATE_SECRET, COVER_CANDIDATE_SECRET, ADMIN_SESSION_SECRET or AUTHOR_SESSION_SECRET is not set",
    );
  }

  return secret;
}

function encodeBase64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBase64UrlJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function signContent(content: string) {
  return createHmac("sha256", getMediaMetadataCandidateSecret())
    .update(content)
    .digest("base64url");
}

function isValidSignature(content: string, signature: string) {
  const expectedSignature = signContent(content);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);

  return (
    expectedSignatureBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedSignatureBuffer, signatureBuffer)
  );
}

function isMediaProviderCode(value: unknown): value is MediaProviderCode {
  return (
    typeof value === "string" &&
    COVER_PROVIDER_CODES.some((providerCode) => providerCode === value)
  );
}

function isAbsoluteHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isMediaMetadataCandidateTokenPayload(
  value: unknown,
): value is MediaMetadataCandidateTokenPayload {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    isMediaProviderCode(value.provider) &&
    typeof value.externalId === "string" &&
    value.externalId.trim().length > 0 &&
    (value.sourceUrl === null || isAbsoluteHttpUrl(value.sourceUrl)) &&
    isPlainRecord(value.facts) &&
    typeof value.exp === "number"
  );
}

export function createMediaMetadataCandidateToken(candidate: MediaMetadataCandidate) {
  const payload = encodeBase64UrlJson({
    ...candidate,
    exp: Math.floor(Date.now() / 1000) + METADATA_CANDIDATE_TOKEN_MAX_AGE_SECONDS,
  } satisfies MediaMetadataCandidateTokenPayload);
  const signature = signContent(payload);

  return `${payload}.${signature}`;
}

export function verifyMediaMetadataCandidateToken(token: string) {
  const [payload, signature] = token.split(".");

  try {
    if (!payload || !signature || !isValidSignature(payload, signature)) {
      return null;
    }

    const decodedPayload = decodeBase64UrlJson(payload);

    if (!isMediaMetadataCandidateTokenPayload(decodedPayload)) {
      return null;
    }

    if (decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      provider: decodedPayload.provider,
      externalId: decodedPayload.externalId,
      sourceUrl: decodedPayload.sourceUrl,
      facts: decodedPayload.facts,
    } satisfies MediaMetadataCandidate;
  } catch {
    return null;
  }
}
