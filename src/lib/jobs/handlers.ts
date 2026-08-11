import "server-only";

import { cleanupAuthorAuthData } from "@/db/operations/author-auth";
import { getEmailAutomationSettings } from "@/db/queries/email-automation";
import { cleanupJobRunHistory } from "@/db/queries/jobs";
import { deliverPendingAuthorEmails } from "@/lib/auth/email-outbox-delivery";
import { backfillCoverThumbnails } from "@/lib/covers/thumbnail-backfill";
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

const jobHistoryCleanupHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "jobs.cleanup-history",
  label: "Очистка истории фоновых задач",
  parsePayload: parseEmptyPayload,
  async execute() {
    await cleanupJobRunHistory();
  },
};

type CoverThumbnailBackfillPayload = {
  limit?: number;
  mediaItemId?: number;
};

function parseCoverThumbnailBackfillPayload(value: unknown): CoverThumbnailBackfillPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  }

  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== "limit" && key !== "mediaItemId")) {
    throw new JobError("invalid-payload", "Задача получила неизвестные параметры.", {
      retryable: false,
    });
  }

  const limit = source.limit === undefined ? undefined : Number(source.limit);
  const mediaItemId = source.mediaItemId === undefined ? undefined : Number(source.mediaItemId);

  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) {
    throw new JobError("invalid-payload", "Лимит должен быть от 1 до 200.", { retryable: false });
  }

  if (mediaItemId !== undefined && (!Number.isSafeInteger(mediaItemId) || mediaItemId < 1)) {
    throw new JobError("invalid-payload", "Некорректный ID записи.", { retryable: false });
  }

  return { limit, mediaItemId };
}

const coverThumbnailBackfillHandler: JobHandlerDefinition<CoverThumbnailBackfillPayload> = {
  type: "media.cover-thumbnails-backfill",
  label: "Восстановление миниатюр обложек",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload: parseCoverThumbnailBackfillPayload,
  async execute({ attempt, payload, runId }) {
    const result = await backfillCoverThumbnails({ attempt, runId, ...payload });

    if (result.failed > 0) {
      throw new JobError(
        "cover-thumbnail-backfill-failed",
        `Не удалось обработать миниатюры: ${result.failed}.`,
        { retryable: result.retryableFailed > 0 },
      );
    }
  },
};

export const jobHandlerRegistry = createJobHandlerRegistry([
  emailOutboxDeliveryHandler,
  authCleanupHandler,
  jobHistoryCleanupHandler,
  coverThumbnailBackfillHandler,
]);
