import { headers } from "next/headers";

import {
  checkFixedWindowRateLimits,
  type FixedWindowRateLimitInput,
  type RateLimitResult,
} from "@/lib/rate-limits/redis";

export type AuthRateLimitScope =
  | "admin"
  | "author"
  | "author-password"
  | "author-access-token"
  | "author-challenge"
  | "author-register"
  | "author-onboarding"
  | "author-forgot"
  | "author-reset"
  | "author-verify";

export type AuthRateLimitLimits = {
  identityQuarterHour: number | null;
  ipHour?: number | null;
  ipQuarterHour?: number | null;
};

export type AuthRateLimitInput = {
  scope: AuthRateLimitScope;
  ipAddress: string;
  identitySubject?: string | null;
  limits: AuthRateLimitLimits;
};

export type AuthRateLimitCheckResult =
  | { ok: true }
  | { ok: false; reason: "limited"; retryAfterSeconds: number }
  | { ok: false; reason: "unavailable" };

type HeaderReader = {
  get(name: string): string | null;
};

const UNKNOWN_IP_ADDRESS = "unknown";

export const ADMIN_AUTH_RATE_LIMITS = {
  identityQuarterHour: 5,
  ipHour: 20,
  ipQuarterHour: null,
} satisfies AuthRateLimitLimits;

export const AUTHOR_AUTH_RATE_LIMITS = {
  identityQuarterHour: 10,
  ipHour: null,
  ipQuarterHour: 10,
} satisfies AuthRateLimitLimits;

export const AUTHOR_AUTH_MUTATION_RATE_LIMITS = {
  identityQuarterHour: 5,
  ipHour: 20,
  ipQuarterHour: 10,
} satisfies AuthRateLimitLimits;

function normalizeRateLimitSubjectPart(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  return normalizedValue || "empty";
}

export function normalizeAuthIdentitySubject(value: string) {
  return normalizeRateLimitSubjectPart(value);
}

export function getAuthRequestIpAddressFromHeaders(requestHeaders: HeaderReader) {
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ipAddress = forwardedFor ?? requestHeaders.get("x-real-ip") ?? UNKNOWN_IP_ADDRESS;

  return normalizeRateLimitSubjectPart(ipAddress);
}

export async function getAuthRequestIpAddress() {
  return getAuthRequestIpAddressFromHeaders(await headers());
}

export function buildAuthRateLimitInputs(input: AuthRateLimitInput): FixedWindowRateLimitInput[] {
  const ipAddress = normalizeRateLimitSubjectPart(input.ipAddress);
  const inputs: FixedWindowRateLimitInput[] = [];

  if (input.identitySubject && input.limits.identityQuarterHour !== null) {
    inputs.push({
      keyPrefix: `auth:${input.scope}:identity`,
      subject: normalizeRateLimitSubjectPart(input.identitySubject),
      window: "quarter-hour",
      limit: input.limits.identityQuarterHour,
    });
  }

  if (input.limits.ipQuarterHour !== undefined && input.limits.ipQuarterHour !== null) {
    inputs.push({
      keyPrefix: `auth:${input.scope}:ip`,
      subject: ipAddress,
      window: "quarter-hour",
      limit: input.limits.ipQuarterHour,
    });
  }

  if (input.limits.ipHour !== undefined && input.limits.ipHour !== null) {
    inputs.push({
      keyPrefix: `auth:${input.scope}:ip`,
      subject: ipAddress,
      window: "hour",
      limit: input.limits.ipHour,
    });
  }

  return inputs;
}

function mapRateLimitResult(result: RateLimitResult): AuthRateLimitCheckResult {
  if (!result.ok) {
    return { ok: false, reason: "unavailable" };
  }

  if (!result.allowed) {
    return {
      ok: false,
      reason: "limited",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return { ok: true };
}

export async function checkAuthRateLimitWithChecker(
  input: AuthRateLimitInput,
  checker: (inputs: readonly FixedWindowRateLimitInput[]) => Promise<RateLimitResult>,
): Promise<AuthRateLimitCheckResult> {
  return mapRateLimitResult(await checker(buildAuthRateLimitInputs(input)));
}

export async function checkAuthRateLimit(
  input: AuthRateLimitInput,
): Promise<AuthRateLimitCheckResult> {
  return checkAuthRateLimitWithChecker(input, checkFixedWindowRateLimits);
}
