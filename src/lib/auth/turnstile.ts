import "server-only";

export type { TurnstileVerificationResult } from "./turnstile-verification";

import {
  verifyTurnstileTokenWithFetcher,
  type TurnstileVerificationResult,
} from "./turnstile-verification";

function getRuntimeEnvironmentValue(name: "TURNSTILE_SITE_KEY" | "TURNSTILE_SECRET_KEY") {
  return process.env[name]?.trim() || null;
}

export function getTurnstileSiteKey() {
  return getRuntimeEnvironmentValue("TURNSTILE_SITE_KEY");
}

export function isTurnstileConfigured() {
  return getTurnstileSiteKey() !== null
    && getRuntimeEnvironmentValue("TURNSTILE_SECRET_KEY") !== null;
}

export async function verifyTurnstileToken(
  token: string,
  options: { expectedAction: string },
): Promise<TurnstileVerificationResult> {
  return verifyTurnstileTokenWithFetcher(token, {
    ...options,
    fetcher: globalThis.fetch,
    secretKey: getRuntimeEnvironmentValue("TURNSTILE_SECRET_KEY"),
  });
}
