const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;
const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000;

export type TurnstileVerificationResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable" };

type TurnstileSiteverifyResponse = { success?: unknown; action?: unknown };
type VerifyTurnstileOptions = { expectedAction: string };
type VerifyTurnstileWithFetcherOptions = VerifyTurnstileOptions & {
  fetcher: typeof fetch;
  secretKey: string | null;
  timeoutMs?: number;
};

export async function verifyTurnstileTokenWithFetcher(
  token: string,
  options: VerifyTurnstileWithFetcherOptions,
): Promise<TurnstileVerificationResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > TURNSTILE_TOKEN_MAX_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  const secret = options.secretKey?.trim() || null;
  if (!secret) return { ok: false, reason: "unavailable" };

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    options.timeoutMs ?? TURNSTILE_VERIFY_TIMEOUT_MS,
  );

  try {
    const response = await options.fetcher(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: normalizedToken }),
      signal: abortController.signal,
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };

    let payload: TurnstileSiteverifyResponse;
    try {
      payload = await response.json() as TurnstileSiteverifyResponse;
    } catch {
      return { ok: false, reason: "unavailable" };
    }

    if (payload.success !== true || payload.action !== options.expectedAction) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
