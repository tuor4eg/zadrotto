import { createHmac, timingSafeEqual } from "node:crypto";

import type { CoverCandidate } from "@/lib/covers/types";

const CANDIDATE_TOKEN_MAX_AGE_SECONDS = 30 * 60;

type CoverCandidateTokenPayload = CoverCandidate & {
  exp: number;
};

function getCoverCandidateSecret() {
  const secret =
    process.env.COVER_CANDIDATE_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.AUTHOR_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("COVER_CANDIDATE_SECRET, ADMIN_SESSION_SECRET or AUTHOR_SESSION_SECRET is not set");
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
  return createHmac("sha256", getCoverCandidateSecret()).update(content).digest("base64url");
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

function isAbsoluteHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isCoverCandidateTokenPayload(value: unknown): value is CoverCandidateTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<CoverCandidateTokenPayload>;

  return (
    typeof payload.id === "string" &&
    typeof payload.provider === "string" &&
    typeof payload.title === "string" &&
    isAbsoluteHttpUrl(payload.imageUrl) &&
    (payload.sourcePageUrl === null || isAbsoluteHttpUrl(payload.sourcePageUrl)) &&
    typeof payload.exp === "number"
  );
}

function withOptionalNumber(
  candidate: CoverCandidate,
  key: "width" | "height" | "year" | "confidence",
  value: unknown,
) {
  if (typeof value === "number") {
    candidate[key] = value;
  }
}

export function createCoverCandidateToken(candidate: CoverCandidate) {
  const payload = encodeBase64UrlJson({
    ...candidate,
    exp: Math.floor(Date.now() / 1000) + CANDIDATE_TOKEN_MAX_AGE_SECONDS,
  } satisfies CoverCandidateTokenPayload);
  const signature = signContent(payload);

  return `${payload}.${signature}`;
}

export function verifyCoverCandidateToken(token: string) {
  const [payload, signature] = token.split(".");

  try {
    if (!payload || !signature || !isValidSignature(payload, signature)) {
      return null;
    }

    const decodedPayload = decodeBase64UrlJson(payload);

    if (!isCoverCandidateTokenPayload(decodedPayload)) {
      return null;
    }

    if (decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const candidate: CoverCandidate = {
      id: decodedPayload.id,
      provider: decodedPayload.provider,
      title: decodedPayload.title,
      imageUrl: decodedPayload.imageUrl,
      sourcePageUrl: decodedPayload.sourcePageUrl,
    };

    withOptionalNumber(candidate, "width", decodedPayload.width);
    withOptionalNumber(candidate, "height", decodedPayload.height);
    withOptionalNumber(candidate, "year", decodedPayload.year);
    withOptionalNumber(candidate, "confidence", decodedPayload.confidence);

    return candidate;
  } catch {
    return null;
  }
}

export function normalizeCoverCandidates(candidates: readonly CoverCandidate[]) {
  const usedImageUrls = new Set<string>();

  return candidates.filter((candidate) => {
    if (!candidate.id.trim() || !candidate.title.trim() || !isAbsoluteHttpUrl(candidate.imageUrl)) {
      return false;
    }

    const imageKey = candidate.imageUrl.trim();

    if (usedImageUrls.has(imageKey)) {
      return false;
    }

    usedImageUrls.add(imageKey);
    return true;
  });
}
