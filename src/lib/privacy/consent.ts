/** Bump only when the substance of the document requires a new confirmation. */
export const CURRENT_CONSENT_VERSION = "2026-11-01";

export function isCurrentConsentSubmission(version: unknown, accepted: unknown) {
  return version === CURRENT_CONSENT_VERSION && accepted === "yes";
}

export class PersonalDataConsentRequiredError extends Error {
  constructor() { super("Current consent is required"); this.name = "PersonalDataConsentRequiredError"; }
}
