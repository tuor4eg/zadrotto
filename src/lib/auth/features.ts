export function isAuthorRegistrationEnabled() {
  return process.env.AUTHOR_REGISTRATION_ENABLED === "true";
}

export function isAuthorEmailVerificationBypassed(
  env: Partial<Record<
    "NODE_ENV" | "AUTHOR_REGISTRATION_SKIP_EMAIL_VERIFICATION",
    string
  >> = process.env,
) {
  return env.NODE_ENV !== "production"
    && env.AUTHOR_REGISTRATION_SKIP_EMAIL_VERIFICATION === "true";
}

export async function isAuthorEmailDeliveryConfigured() {
  const { getResendEmailDeliveryReadiness } = await import("@/db/queries/email-provider");
  return Boolean(await getResendEmailDeliveryReadiness());
}
