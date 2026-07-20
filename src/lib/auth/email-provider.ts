import { isValidAuthorEmail, normalizeAuthorEmail } from "@/lib/auth/author-account";

export type ResendEmailConfig = {
  apiKey: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  enabled: boolean;
};

export function parseResendEmailConfig(values: Record<string, string>): ResendEmailConfig | null {
  const apiKey = values.apiKey?.trim();
  const fromName = values.fromName?.trim();
  const fromEmail = values.fromEmail?.trim();
  const replyTo = values.replyTo?.trim() || undefined;
  if (!apiKey || !fromName || !fromEmail || !fromEmail.includes("@")) return null;
  return { apiKey, fromName, fromEmail, replyTo, enabled: values.enabled === "true" };
}

export function validateResendEmailConfig(input: {
  apiKey: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  enabled: boolean;
}) {
  const apiKey = input.apiKey.trim();
  const fromName = input.fromName.trim();
  const fromEmail = normalizeAuthorEmail(input.fromEmail);
  const replyTo = input.replyTo?.trim() ? normalizeAuthorEmail(input.replyTo) : undefined;
  if (!/^re_[A-Za-z0-9_-]{20,200}$/.test(apiKey)
    || fromName.length < 1 || fromName.length > 100
    || !isValidAuthorEmail(fromEmail)
    || (replyTo !== undefined && !isValidAuthorEmail(replyTo))) return null;
  return { apiKey, fromName, fromEmail, replyTo, enabled: input.enabled };
}
