import "server-only";

import { cleanupAuthorAuthData } from "@/db/operations/author-auth";
import { getEmailAutomationSettings } from "@/db/queries/email-automation";
import { deliverPendingAuthorEmails } from "@/lib/auth/email-outbox-delivery";
import { createJobHandlerRegistry } from "./registry";
import { JobError, type JobHandlerDefinition } from "./types";

function parseEmptyPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0) {
    throw new JobError("invalid-payload", "Задача не принимает параметры.", { retryable: false });
  }
  return {};
}

const emailOutboxDeliveryHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "auth.email-outbox-delivery",
  label: "Доставка системных email",
  parsePayload: parseEmptyPayload,
  async execute() {
    const settings = await getEmailAutomationSettings();
    const result = await deliverPendingAuthorEmails(settings);
    if (!result.ok) {
      throw new JobError("email-unavailable", "Email-провайдер недоступен.");
    }
  },
};

const authCleanupHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "auth.cleanup",
  label: "Очистка авторской аутентификации",
  parsePayload: parseEmptyPayload,
  async execute() {
    const settings = await getEmailAutomationSettings();
    await cleanupAuthorAuthData(settings);
  },
};

export const jobHandlerRegistry = createJobHandlerRegistry([
  emailOutboxDeliveryHandler,
  authCleanupHandler,
]);
