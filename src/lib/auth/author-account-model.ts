export const AUTHOR_ACCOUNT_STATUSES = [
  "pending_email",
  "pending_approval",
  "active",
  "rejected",
] as const;

export type AuthorAccountStatus = (typeof AUTHOR_ACCOUNT_STATUSES)[number];

export const AUTHOR_AUTH_METHODS = ["password", "access_token", "telegram"] as const;
export type AuthorAuthMethod = (typeof AUTHOR_AUTH_METHODS)[number];

export const AUTHOR_AUTH_CHALLENGE_PURPOSES = [
  "verify_email",
  "reset_password",
  "change_email",
] as const;
export type AuthorAuthChallengePurpose = (typeof AUTHOR_AUTH_CHALLENGE_PURPOSES)[number];

export const EMAIL_OUTBOX_TEMPLATES = [
  "verify_email",
  "reset_password",
  "email_changed",
  "registration_approved",
  "registration_rejected",
] as const;
export type EmailOutboxTemplate = (typeof EMAIL_OUTBOX_TEMPLATES)[number];

export const EMAIL_OUTBOX_STATUSES = ["pending", "sending", "sent", "failed"] as const;
export type EmailOutboxStatus = (typeof EMAIL_OUTBOX_STATUSES)[number];
