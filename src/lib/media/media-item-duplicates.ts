import { createHmac, timingSafeEqual } from "node:crypto";

import type { MediaType } from "@/lib/media/types";

const DUPLICATE_ACKNOWLEDGEMENT_MAX_AGE_SECONDS = 30 * 60;

export type MediaItemDuplicateCheckInput = {
  mediaType: MediaType;
  originalTitle: string | null;
  releaseYear: number | null;
  title: string;
};

export type MediaItemDuplicateMatch = {
  id: number;
  code: string;
  mediaType: string;
  originalTitle: string | null;
  releaseYear: number | null;
  title: string;
};

type MediaItemDuplicateAcknowledgementPayload = {
  exp: number;
  fingerprint: string;
};

function getMediaItemDuplicateSecret() {
  const secret =
    process.env.MEDIA_ITEM_DUPLICATE_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.AUTHOR_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "MEDIA_ITEM_DUPLICATE_SECRET, ADMIN_SESSION_SECRET or AUTHOR_SESSION_SECRET is not set",
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
  return createHmac("sha256", getMediaItemDuplicateSecret())
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDuplicateAcknowledgementPayload(
  value: unknown,
): value is MediaItemDuplicateAcknowledgementPayload {
  return (
    isPlainRecord(value) &&
    typeof value.fingerprint === "string" &&
    typeof value.exp === "number"
  );
}

export function normalizeMediaItemDuplicateTitle(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function getInputComparableTitles(input: MediaItemDuplicateCheckInput) {
  return [input.title, input.originalTitle]
    .map(normalizeMediaItemDuplicateTitle)
    .filter(Boolean);
}

function getMatchComparableTitles(match: MediaItemDuplicateMatch) {
  return [match.title, match.originalTitle]
    .map(normalizeMediaItemDuplicateTitle)
    .filter(Boolean);
}

export function isExactMediaItemDuplicate(
  input: MediaItemDuplicateCheckInput,
  match: MediaItemDuplicateMatch,
) {
  if (
    input.releaseYear === null ||
    match.releaseYear !== input.releaseYear ||
    match.mediaType !== input.mediaType
  ) {
    return false;
  }

  const inputTitles = getInputComparableTitles(input);
  const matchTitles = getMatchComparableTitles(match);

  return inputTitles.some((inputTitle) => matchTitles.includes(inputTitle));
}

function getDuplicateAcknowledgementFingerprint(
  input: MediaItemDuplicateCheckInput,
  matches: MediaItemDuplicateMatch[],
) {
  return JSON.stringify({
    mediaType: input.mediaType,
    title: normalizeMediaItemDuplicateTitle(input.title),
    originalTitle: normalizeMediaItemDuplicateTitle(input.originalTitle),
    releaseYear: input.releaseYear,
    matchIds: matches.map((match) => match.id).sort((left, right) => left - right),
  });
}

export function createMediaItemDuplicateAcknowledgementToken(input: {
  form: MediaItemDuplicateCheckInput;
  matches: MediaItemDuplicateMatch[];
}) {
  const payload = encodeBase64UrlJson({
    fingerprint: getDuplicateAcknowledgementFingerprint(input.form, input.matches),
    exp: Math.floor(Date.now() / 1000) + DUPLICATE_ACKNOWLEDGEMENT_MAX_AGE_SECONDS,
  } satisfies MediaItemDuplicateAcknowledgementPayload);
  const signature = signContent(payload);

  return `${payload}.${signature}`;
}

export function verifyMediaItemDuplicateAcknowledgementToken(
  token: string,
  input: {
    form: MediaItemDuplicateCheckInput;
    matches: MediaItemDuplicateMatch[];
  },
) {
  const [payload, signature] = token.split(".");

  try {
    if (!payload || !signature || !isValidSignature(payload, signature)) {
      return false;
    }

    const decodedPayload = decodeBase64UrlJson(payload);

    if (!isDuplicateAcknowledgementPayload(decodedPayload)) {
      return false;
    }

    if (decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    return (
      decodedPayload.fingerprint ===
      getDuplicateAcknowledgementFingerprint(input.form, input.matches)
    );
  } catch {
    return false;
  }
}
