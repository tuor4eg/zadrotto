import "server-only";

import { isTurnstileConfigured } from "@/lib/auth/turnstile";
import { buildMissingServiceConfigHealthCheck, buildServiceHealthCheck } from "@/lib/services/health";

export function isTurnstileRegistrationBypassed() {
  return process.env.TURNSTILE_REGISTRATION_BYPASS === "true";
}

export async function checkRegistrationTurnstileHealth() {
  const startedAt = Date.now();

  if (isTurnstileRegistrationBypassed()) {
    return buildServiceHealthCheck({
      code: "turnstile-registration",
      name: "Turnstile регистрации",
      status: "degraded",
      message: "Аварийный обход регистрации включён.",
      startedAt,
    });
  }

  if (!isTurnstileConfigured()) {
    return buildMissingServiceConfigHealthCheck({
      code: "turnstile-registration",
      name: "Turnstile регистрации",
      message: "TURNSTILE_SITE_KEY или TURNSTILE_SECRET_KEY не задан.",
    });
  }

  return buildServiceHealthCheck({
    code: "turnstile-registration",
    name: "Turnstile регистрации",
    status: "healthy",
    message: "Настроен. Токены проверяются при отправке регистрации.",
    startedAt,
  });
}
