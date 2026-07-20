export function isAuthorRegistrationEnabled() {
  return process.env.AUTHOR_REGISTRATION_ENABLED === "true";
}

export async function isAuthorEmailDeliveryConfigured() {
  const { getResendEmailDeliveryReadiness } = await import("@/db/queries/email-provider");
  return Boolean(await getResendEmailDeliveryReadiness());
}
