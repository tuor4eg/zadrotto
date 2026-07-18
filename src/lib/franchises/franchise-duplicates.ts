import { createHmac, timingSafeEqual } from "node:crypto";

import type { FranchiseDuplicateMatch } from "@/db/queries/franchises";

const ACKNOWLEDGEMENT_MAX_AGE_SECONDS = 30 * 60;

export type FranchiseDuplicateCheckInput = {
  title: string;
  originalTitle: string | null;
};

type AcknowledgementPayload = {
  exp: number;
  fingerprint: string;
};

function getSecret() {
  const secret =
    process.env.FRANCHISE_DUPLICATE_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.AUTHOR_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("FRANCHISE_DUPLICATE_SECRET, ADMIN_SESSION_SECRET or AUTHOR_SESSION_SECRET is not set");
  }

  return secret;
}

function normalizeTitle(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function titles(value: FranchiseDuplicateCheckInput | FranchiseDuplicateMatch) {
  return [value.title, value.originalTitle].map(normalizeTitle).filter(Boolean);
}

export function isExactFranchiseDuplicate(
  input: FranchiseDuplicateCheckInput,
  match: FranchiseDuplicateMatch,
) {
  const inputTitles = titles(input);
  const matchTitles = titles(match);

  return inputTitles.some((title) => matchTitles.includes(title));
}

function fingerprint(input: FranchiseDuplicateCheckInput, matches: FranchiseDuplicateMatch[]) {
  return JSON.stringify({
    title: normalizeTitle(input.title),
    originalTitle: normalizeTitle(input.originalTitle),
    matchIds: matches.map((match) => match.id).sort((left, right) => left - right),
  });
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createFranchiseDuplicateAcknowledgementToken(input: {
  form: FranchiseDuplicateCheckInput;
  matches: FranchiseDuplicateMatch[];
}) {
  const payload = Buffer.from(JSON.stringify({
    fingerprint: fingerprint(input.form, input.matches),
    exp: Math.floor(Date.now() / 1000) + ACKNOWLEDGEMENT_MAX_AGE_SECONDS,
  } satisfies AcknowledgementPayload)).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyFranchiseDuplicateAcknowledgementToken(
  token: string,
  input: { form: FranchiseDuplicateCheckInput; matches: FranchiseDuplicateMatch[] },
) {
  const [payload, signature] = token.split(".");

  try {
    if (!payload || !signature) return false;

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AcknowledgementPayload;
    return (
      typeof decoded.exp === "number" &&
      typeof decoded.fingerprint === "string" &&
      decoded.exp > Math.floor(Date.now() / 1000) &&
      decoded.fingerprint === fingerprint(input.form, input.matches)
    );
  } catch {
    return false;
  }
}
