import "server-only";

import { cleanupAuthorAuthData } from "@/db/operations/author-auth";
import { getEmailAutomationSettings } from "@/db/queries/email-automation";
import { cleanupJobRunHistory } from "@/db/queries/jobs";
import { deliverPendingAuthorEmails } from "@/lib/auth/email-outbox-delivery";
import { backfillCoverThumbnails } from "@/lib/covers/thumbnail-backfill";
import { backfillAchievements, type AchievementBackfillPayload } from "@/lib/achievements/backfill";
import { dispatchDomainEvent, recoverPendingDomainEvents } from "@/lib/domain-events/dispatcher";
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

type DomainEventDispatchPayload = { eventId?: string; limit?: number };

function parseDomainEventDispatchPayload(value: unknown): DomainEventDispatchPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== "eventId" && key !== "limit")) {
    throw new JobError("invalid-payload", "Задача получила неизвестные параметры.", {
      retryable: false,
    });
  }
  const eventId = source.eventId === undefined ? undefined : String(source.eventId);
  const limit = source.limit === undefined ? undefined : Number(source.limit);
  if (eventId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new JobError("invalid-payload", "Некорректный ID доменного события.", { retryable: false });
  }
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) {
    throw new JobError("invalid-payload", "Лимит должен быть от 1 до 200.", { retryable: false });
  }
  if (eventId !== undefined && limit !== undefined) {
    throw new JobError("invalid-payload", "Нельзя одновременно передать eventId и limit.", { retryable: false });
  }
  return { eventId, limit };
}

const domainEventDispatchHandler: JobHandlerDefinition<DomainEventDispatchPayload> = {
  type: "domain-events.dispatch",
  label: "Доставка доменных событий",
  defaultMaxAttempts: 5,
  defaultTimeoutSeconds: 300,
  parsePayload: parseDomainEventDispatchPayload,
  async execute({ payload }) {
    if (payload.eventId) {
      await dispatchDomainEvent(payload.eventId);
      return;
    }
    await recoverPendingDomainEvents(payload.limit);
  },
};

function parseAchievementBackfillPayload(value: unknown): AchievementBackfillPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  }
  const source = value as Record<string, unknown>;
  const allowedKeys = new Set(["achievementIds", "afterAuthorId", "awardGroupId", "batchSize"]);
  if (Object.keys(source).some((key) => !allowedKeys.has(key))) {
    throw new JobError("invalid-payload", "Задача получила неизвестные параметры.", {
      retryable: false,
    });
  }
  const batchSize = source.batchSize === undefined ? undefined : Number(source.batchSize);
  const afterAuthorId = source.afterAuthorId === undefined ? undefined : Number(source.afterAuthorId);
  const awardGroupId = source.awardGroupId === undefined ? undefined : String(source.awardGroupId);
  const achievementIds = source.achievementIds === undefined
    ? undefined
    : Array.isArray(source.achievementIds)
      ? source.achievementIds.map(Number)
      : null;

  if (batchSize !== undefined && (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500)) {
    throw new JobError("invalid-payload", "Размер батча должен быть от 1 до 500.", { retryable: false });
  }
  if (afterAuthorId !== undefined && (!Number.isSafeInteger(afterAuthorId) || afterAuthorId < 1)) {
    throw new JobError("invalid-payload", "Некорректный курсор автора.", { retryable: false });
  }
  if (awardGroupId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(awardGroupId)) {
    throw new JobError("invalid-payload", "Некорректная группа выдачи.", { retryable: false });
  }
  if (achievementIds === null || achievementIds?.some(
    (id) => !Number.isSafeInteger(id) || id < 1,
  )) {
    throw new JobError("invalid-payload", "Некорректный ID ачивки.", { retryable: false });
  }

  return {
    achievementIds,
    afterAuthorId,
    awardGroupId,
    batchSize,
  };
}

const achievementBackfillHandler: JobHandlerDefinition<AchievementBackfillPayload> = {
  type: "achievements.backfill",
  label: "Ретроактивная выдача ачивок",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  schedulable: false,
  parsePayload: parseAchievementBackfillPayload,
  async execute({ payload }) {
    await backfillAchievements(payload);
  },
};

export const jobHandlerRegistry = createJobHandlerRegistry([
  emailOutboxDeliveryHandler,
  authCleanupHandler,
  jobHistoryCleanupHandler,
  coverThumbnailBackfillHandler,
  domainEventDispatchHandler,
  achievementBackfillHandler,
]);
