import { anilistCreatorApprovalHandler } from "@/lib/creators/anilist-creator-jobs";
import { creatorAutoApprovalHandler } from "@/lib/creators/auto-approval-job";
import { creatorNameLocalizationHandler } from "@/lib/creators/name-localization-job";
import { genreSeriesApplyHandler } from "@/lib/media/genre-series-job";
import { reputationInitializeHandler } from "@/lib/reputation/initialization-job";
import { creatorImageFillHandler, creatorImagesBackfillHandler, creatorImageRefreshHandler } from "@/lib/creators/image-jobs";
import { tmdbDirectorApprovalHandler } from "@/lib/creators/tmdb-director-jobs";
import { tmdbCompanyApprovalHandler } from "@/lib/creators/tmdb-company-jobs";
import type { SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { providerSnapshotJobHandler } from "@/lib/providers/snapshot-job";
import { platformLogosSyncHandler } from "@/lib/platforms/logo-sync-job";
import { gameCompanyEnrichHandler } from "@/lib/creators/game-company-images";
import { applyPlatformRequest } from "@/db/queries/platform-requests";
import { applyCreatorRequest } from "@/db/queries/creator-requests";
import { titlePartPosterHandler } from "@/lib/media/title-part-poster-job";
import "server-only";

import { applyGenreRequest } from "@/db/queries/genre-requests";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { cleanupAuthorAuthData } from "@/db/operations/author-auth";
import { getEmailAutomationSettings } from "@/db/queries/email-automation";
import { cleanupJobRunHistory } from "@/db/queries/jobs";
import { deliverPendingAuthorEmails } from "@/lib/auth/email-outbox-delivery";
import { backfillCoverThumbnails } from "@/lib/covers/thumbnail-backfill";
import { backfillAchievements, type AchievementBackfillPayload } from "@/lib/achievements/backfill";
import { dispatchDomainEvent, recoverPendingDomainEvents } from "@/lib/domain-events/dispatcher";
import { enqueueDomainEventDispatch } from "@/lib/domain-events/queue";
import { deliverPendingNotificationTransports } from "@/lib/notifications/outbox-delivery";
import { isMediaTypeCode } from "@/lib/media/types";
import { backfillMediaMetadata, type MetadataBackfillPayload } from "@/lib/media/metadata-backfill";
import { refreshStaleMediaMetadata, type MetadataRefreshPayload } from "@/lib/media/metadata-refresh";
import { backfillAnimeFromShikimori } from "@/lib/media/anime-shikimori-backfill";
import { generateEditorialSummary, sweepEditorialSummaries } from "@/lib/media/editorial-summary-jobs";
import { EDITORIAL_SUMMARY_GENERATE_TYPE, EDITORIAL_SUMMARY_SWEEP_TYPE } from "@/lib/media/editorial-summary";
import { cleanupAdminExports, generateAdminExport } from "@/lib/admin-exports/generate";
import {
  reconcileMediaItemRatingStatsBatch,
  type RatingStatsReconciliationPayload,
} from "@/db/queries/media-item-rating-stats";
import { createJobHandlerRegistry } from "./registry";
import { processAutomoderationCheck } from "@/lib/automoderation/process";
import { MEDIA_AUTOMODERATION_JOB_TYPE } from "@/lib/automoderation/model";
import { JobError, type JobHandlerDefinition } from "./types";
import { promoteEligibleTrustedAuthors } from "@/lib/reputation/service";

function jobGuard(runId: number, lockToken?: string): SnapshotJobGuard | undefined {
  return lockToken ? {runId, lockToken} : undefined;
}

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
  async execute({ signal }) {
    const settings = await getEmailAutomationSettings();
    const result = await deliverPendingAuthorEmails(settings, signal);
    if (!result.ok) {
      throw new JobError("email-unavailable", "Email-провайдер недоступен.");
    }
  },
};

const authCleanupHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "auth.cleanup",
  label: "Очистка авторской аутентификации",
  parsePayload: parseEmptyPayload,
  async execute({ runId, lockToken }) {
    const settings = await getEmailAutomationSettings();
    await cleanupAuthorAuthData(settings, new Date(), jobGuard(runId, lockToken));
  },
};

const jobHistoryCleanupHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "jobs.cleanup-history",
  label: "Очистка истории фоновых задач",
  parsePayload: parseEmptyPayload,
  async execute({ runId, lockToken }) {
    await cleanupJobRunHistory(new Date(), jobGuard(runId, lockToken));
  },
};

function parseAdminExportPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== 1 || typeof source.exportId !== "string" || !/^[0-9a-f-]{36}$/i.test(source.exportId)) throw new JobError("invalid-payload", "Некорректный ID экспорта.", { retryable: false });
  return { exportId: source.exportId };
}

const adminExportGenerateHandler: JobHandlerDefinition<{ exportId: string }> = {
  type: "admin.export-generate", label: "Экспорт данных и дамп базы", schedulable: false,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 3600, parsePayload: parseAdminExportPayload,
  async execute({ payload, signal, runId, lockToken }) { await generateAdminExport(payload.exportId, signal, jobGuard(runId, lockToken)); },
};
const adminExportCleanupHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "admin.export-cleanup", label: "Очистка экспортов", parsePayload: parseEmptyPayload,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  async execute({runId, lockToken, signal}) { await cleanupAdminExports(jobGuard(runId, lockToken), signal); },
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
  async execute({ attempt, payload, runId, lockToken, signal }) {
    const result = await backfillCoverThumbnails({ attempt, runId, signal, jobGuard: jobGuard(runId, lockToken), ...payload });

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

function parseOptionalSafeInt(
  value: unknown,
  message: string,
  min: number,
  max: number,
) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new JobError("invalid-payload", message, { retryable: false });
  }
  return parsed;
}

function parseMetadataJobPayloadBase(value: unknown, extraKeys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  }

  const source = value as Record<string, unknown>;
  const allowedKeys = new Set(["limit", "mediaItemId", "quotaReserve", ...extraKeys]);
  if (Object.keys(source).some((key) => !allowedKeys.has(key))) {
    throw new JobError("invalid-payload", "Задача получила неизвестные параметры.", {
      retryable: false,
    });
  }

  const limit = parseOptionalSafeInt(source.limit, "Лимит должен быть от 1 до 200.", 1, 200);
  const mediaItemId = parseOptionalSafeInt(source.mediaItemId, "Некорректный ID записи.", 1, Number.MAX_SAFE_INTEGER);
  const quotaReserve = parseOptionalSafeInt(
    source.quotaReserve,
    "Резерв квоты должен быть от 0 до 10000.",
    0,
    10000,
  );

  return { limit, mediaItemId, quotaReserve, source };
}

function parseMetadataBackfillPayload(value: unknown): MetadataBackfillPayload {
  const { limit, mediaItemId, quotaReserve, source } = parseMetadataJobPayloadBase(value, ["partsOnly", "force", "mediaType", "creatorsOnly", "afterId"]);
  if (source.partsOnly !== undefined && typeof source.partsOnly !== "boolean") throw new JobError("invalid-payload", "partsOnly должен быть логическим значением.", { retryable: false });
  if (source.force !== undefined && typeof source.force !== "boolean") throw new JobError("invalid-payload", "force должен быть логическим значением.", { retryable: false });
  if (source.mediaType !== undefined && (typeof source.mediaType !== "string" || !isMediaTypeCode(source.mediaType))) throw new JobError("invalid-payload", "Некорректный тип записи.", { retryable: false });
  if (source.creatorsOnly !== undefined && typeof source.creatorsOnly !== "boolean") throw new JobError("invalid-payload", "creatorsOnly должен быть логическим значением.", {retryable:false});
  if (source.creatorsOnly && (source.partsOnly || (source.mediaType && source.mediaType !== "anime"))) throw new JobError("invalid-payload", "Состав AniList доступен только для аниме.", {retryable:false});
  const afterId = parseOptionalSafeInt(source.afterId, "Некорректный курсор.", 0, Number.MAX_SAFE_INTEGER);
  return { limit, mediaItemId, quotaReserve, creatorsOnly: source.creatorsOnly as boolean | undefined, afterId, partsOnly: source.partsOnly as boolean | undefined,
    force: source.force as boolean | undefined, mediaType: source.mediaType as string | undefined };
}

const metadataBackfillHandler: JobHandlerDefinition<MetadataBackfillPayload> = {
  type: "media.metadata-backfill",
  label: "Заполнение метаданных записей",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload: parseMetadataBackfillPayload,
  async execute({ attempt, payload, runId, lockToken, signal }) {
    const result = await backfillMediaMetadata({ attempt, runId, lockToken, signal, ...payload });

    if (result.stopError) {
      throw new JobError(result.stopError, "Заполнение метаданных остановлено лимитом провайдера или недоступной проверкой лимита.", { retryable: false });
    }
    if (result.retryableFailed > 0) {
      throw new JobError(
        "metadata-backfill-failed",
        `Не удалось заполнить метаданные: ${result.failed}.`,
        { retryable: true },
      );
    }
    for (const item of result.updatedItems) {
      signal.throwIfAborted();
      await logSystemActivity({
        action: "media.metadata-backfill.completed",
        entityId: item.id,
        entityLabel: item.title,
        message: payload.partsOnly
          ? "Части записи обновлены из источника."
          : "Метаданные записи заполнены из источника.",
        metadata: {
          force: Boolean(payload.force),
          partsOnly: Boolean(payload.partsOnly),
          runId,
        },
      });
    }
    const updatedTitles = result.updatedItems.map((item) => item.title);
    const updatedTitlesLabel = updatedTitles.length === 0
      ? "нет"
      : updatedTitles.length <= 10
        ? updatedTitles.join(", ")
        : `${updatedTitles.slice(0, 10).join(", ")} и ещё ${updatedTitles.length - 10}`;
    await logSystemActivity({
      action: "media.metadata-backfill.completed",
      entityType: "job-run",
      entityId: runId,
      message: payload.partsOnly
        ? `Бэкфилл частей завершён: обновлено ${result.updated} (${updatedTitlesLabel}), пропущено ${result.skipped}, ошибок ${result.failed}.`
        : `Заполнение метаданных завершено: обновлено ${result.updated} (${updatedTitlesLabel}), пропущено ${result.skipped}, ошибок ${result.failed}.`,
      metadata: {
        failed: result.failed,
        force: Boolean(payload.force),
        limit: payload.limit ?? null,
        mediaType: payload.mediaType ?? null,
        partsOnly: Boolean(payload.partsOnly),
        skipped: result.skipped,
        updated: result.updated,
        updatedItems: result.updatedItems,
      },
    });
  },
};

function parseMetadataRefreshPayload(value: unknown): MetadataRefreshPayload {
  const { limit, mediaItemId, quotaReserve, source } = parseMetadataJobPayloadBase(value, ["staleDays"]);
  const staleDays = parseOptionalSafeInt(source.staleDays, "Порог устаревания должен быть от 1 до 3650 дней.", 1, 3650);
  return { limit, mediaItemId, quotaReserve, staleDays };
}

const metadataRefreshHandler: JobHandlerDefinition<MetadataRefreshPayload> = {
  type: "media.metadata-refresh",
  label: "Обновление метаданных сериалов и аниме",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload: parseMetadataRefreshPayload,
  async execute({ attempt, payload, runId, lockToken, signal }) {
    const result = await refreshStaleMediaMetadata({ attempt, runId, lockToken, signal, ...payload });

    if (result.stopError) {
      throw new JobError(result.stopError, "Обновление метаданных остановлено лимитом провайдера или недоступной проверкой лимита.", { retryable: false });
    }
    if (result.retryableFailed > 0) {
      throw new JobError(
        "metadata-refresh-failed",
        `Не удалось обновить метаданные: ${result.failed}.`,
        { retryable: true },
      );
    }
  },
};

const animeShikimoriBackfillHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "media.anime-shikimori-backfill",
  label: "Русские названия и описания аниме",
  defaultMaxAttempts: 1,
  defaultTimeoutSeconds: 60,
  parsePayload: parseEmptyPayload,
  async execute({ runId, lockToken, signal }) {
    await backfillAnimeFromShikimori(jobGuard(runId, lockToken), signal);
  },
};

function parseRatingStatsReconciliationPayload(
  value: unknown,
): RatingStatsReconciliationPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== "afterMediaItemId" && key !== "batchSize")) {
    throw new JobError("invalid-payload", "Задача получила неизвестные параметры.", {
      retryable: false,
    });
  }
  const afterMediaItemId = parseOptionalSafeInt(
    source.afterMediaItemId,
    "Некорректный курсор записи.",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const batchSize = parseOptionalSafeInt(
    source.batchSize,
    "Размер батча должен быть от 1 до 500.",
    1,
    500,
  );
  return { afterMediaItemId, batchSize };
}

const ratingStatsReconciliationHandler: JobHandlerDefinition<RatingStatsReconciliationPayload> = {
  type: "media.rating-stats-reconcile",
  label: "Сверка статистики оценок записей",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload: parseRatingStatsReconciliationPayload,
  async execute({ payload, runId, lockToken }) {
    const result = await reconcileMediaItemRatingStatsBatch(payload, jobGuard(runId, lockToken));
    console.info("rating stats reconciliation completed", result);
  },
};

const editorialSummarySweepHandler: JobHandlerDefinition<Record<string, never>> = {
  type: EDITORIAL_SUMMARY_SWEEP_TYPE,
  label: "Поиск записей для AI-справок",
  parsePayload: parseEmptyPayload,
  async execute({runId, lockToken, signal}) { await sweepEditorialSummaries(jobGuard(runId, lockToken), signal); },
};

function parseEditorialSummaryGeneratePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался ID записи.", { retryable: false });
  }
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => key !== "mediaItemId" && key !== "force") ||
    !Number.isSafeInteger(payload.mediaItemId) || Number(payload.mediaItemId) < 1 ||
    (payload.force !== undefined && payload.force !== true)) {
    throw new JobError("invalid-payload", "Некорректный ID записи.", { retryable: false });
  }
  return { mediaItemId: Number(payload.mediaItemId), force: payload.force === true };
}

const editorialSummaryGenerateHandler: JobHandlerDefinition<{ mediaItemId: number; force: boolean }> = {
  type: EDITORIAL_SUMMARY_GENERATE_TYPE,
  label: "Генерация AI-справки записи",
  schedulable: false,
  parsePayload: parseEditorialSummaryGeneratePayload,
  async execute({ payload, runId, lockToken, signal }) { await generateEditorialSummary(payload.mediaItemId, payload.force, jobGuard(runId, lockToken), signal); },
};

const domainEventDispatchHandler: JobHandlerDefinition<DomainEventDispatchPayload> = {
  type: "domain-events.dispatch",
  label: "Доставка доменных событий",
  defaultMaxAttempts: 5,
  defaultTimeoutSeconds: 300,
  parsePayload: parseDomainEventDispatchPayload,
  async execute({ payload, runId, lockToken, signal }) {
    const context = {jobGuard: jobGuard(runId, lockToken), signal};
    if (payload.eventId) {
      await dispatchDomainEvent(payload.eventId, context);
      return;
    }
    const result = await recoverPendingDomainEvents(payload.limit, context);
    if (result.failed) throw new JobError("event-recovery-incomplete", `Ошибок обработки событий: ${result.failed}. Подробнее: /admin/activity. Повтор управляется outbox.`, { retryable: false });
  },
};

const notificationTransportDeliveryHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "notifications.transport-delivery",
  label: "Доставка внешних уведомлений",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload: parseEmptyPayload,
  async execute({ signal, runId, lockToken }) {
    await deliverPendingNotificationTransports(signal, jobGuard(runId, lockToken));
  },
};

function parseAutomoderationPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался ID проверки автомодерации.", { retryable: false });
  }
  const source = value as Record<string, unknown>;
  const checkId = Number(source.checkId);
  if (Object.keys(source).length !== 1 || !Number.isSafeInteger(checkId) || checkId < 1) {
    throw new JobError("invalid-payload", "Некорректный ID проверки автомодерации.", { retryable: false });
  }
  return { checkId };
}

const automoderationHandler: JobHandlerDefinition<{ checkId: number }> = {
  type: MEDIA_AUTOMODERATION_JOB_TYPE,
  label: "Автомодерация публикации",
  schedulable: false,
  defaultMaxAttempts: 1,
  defaultTimeoutSeconds: 60,
  parsePayload: parseAutomoderationPayload,
  async execute({ payload, runId, lockToken, signal }) {
    await processAutomoderationCheck(payload.checkId, {jobGuard: jobGuard(runId, lockToken), signal});
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
  async execute({ payload, runId, lockToken }) {
    await backfillAchievements(payload, jobGuard(runId, lockToken));
  },
};

const reputationPromoteTrustedHandler: JobHandlerDefinition<Record<string, never>> = {
  type: "reputation.promote-trusted",
  label: "Автоматическое назначение Trusted",
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 120,
  parsePayload: parseEmptyPayload,
  async execute({ runId, lockToken }) {
    const eventIds = await promoteEligibleTrustedAuthors(jobGuard(runId, lockToken));
    await Promise.all(eventIds.map(id => enqueueDomainEventDispatch(id, jobGuard(runId, lockToken))));
  },
};

const genreRequestApplyHandler: JobHandlerDefinition<{ requestId: number }> = {
  type: "media.genre-request-apply",
  label: "Применение решения по жанру",
  schedulable: false,
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
    }
    const source = value as Record<string, unknown>;
    if (Object.keys(source).length !== 1 || typeof source.requestId !== "number"
      || !Number.isSafeInteger(source.requestId) || source.requestId <= 0 || source.requestId > 2_147_483_647) {
      throw new JobError("invalid-payload", "Некорректный ID заявки на жанр.", { retryable: false });
    }
    return { requestId: source.requestId };
  },
  async execute({ payload, signal, runId, lockToken }) {
    await applyGenreRequest(payload.requestId, { signal, jobRunId: runId, jobGuard: jobGuard(runId, lockToken) });
  },
};

const platformRequestApplyHandler: JobHandlerDefinition<{ requestId: number }> = {
  ...genreRequestApplyHandler, type: "media.platform-request-apply", label: "Применение решения по платформе",
  async execute({ payload, signal, runId, lockToken }) {
    await applyPlatformRequest(payload.requestId, { signal, jobRunId: runId, jobGuard: jobGuard(runId, lockToken) });
  },
};

const creatorRequestApplyHandler: JobHandlerDefinition<{ requestId: number }> = {
  ...genreRequestApplyHandler, type: "media.creator-request-apply", label: "Применение решения по создателю",
  parsePayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
    }
    const { orphanCreatorId, ...rest } = value as Record<string, unknown>;
    if (orphanCreatorId !== undefined && (typeof orphanCreatorId !== "number" || !Number.isSafeInteger(orphanCreatorId) || orphanCreatorId <= 0 || orphanCreatorId > 2_147_483_647)) {
      throw new JobError("invalid-payload", "Некорректный ID создателя.", { retryable: false });
    }
    if (Object.keys(rest).length !== 1 || typeof rest.requestId !== "number" || !Number.isSafeInteger(rest.requestId) || rest.requestId <= 0 || rest.requestId > 2_147_483_647) {
      throw new JobError("invalid-payload", "Некорректный ID заявки на создателя.", { retryable: false });
    }
    return { requestId: rest.requestId, ...(orphanCreatorId !== undefined ? { orphanCreatorId } : {}) };
  },
  async execute({ payload, signal, runId, lockToken }) { await applyCreatorRequest(payload.requestId, { signal, jobRunId: runId, jobGuard: jobGuard(runId, lockToken) }); },
};
export const jobHandlerRegistry = createJobHandlerRegistry([
  creatorNameLocalizationHandler,
  providerSnapshotJobHandler,
  creatorImageFillHandler,
  creatorImagesBackfillHandler,
  creatorImageRefreshHandler,
  anilistCreatorApprovalHandler,
  creatorAutoApprovalHandler,
  tmdbDirectorApprovalHandler,
  tmdbCompanyApprovalHandler,
  platformLogosSyncHandler,
  gameCompanyEnrichHandler,
  creatorRequestApplyHandler,
  genreSeriesApplyHandler,
  genreRequestApplyHandler,
  platformRequestApplyHandler,
  emailOutboxDeliveryHandler,
  authCleanupHandler,
  jobHistoryCleanupHandler,
  adminExportGenerateHandler,
  adminExportCleanupHandler,
  coverThumbnailBackfillHandler,
  titlePartPosterHandler,
  metadataBackfillHandler,
  metadataRefreshHandler,
  animeShikimoriBackfillHandler,
  editorialSummarySweepHandler,
  editorialSummaryGenerateHandler,
  ratingStatsReconciliationHandler,
  domainEventDispatchHandler,
  notificationTransportDeliveryHandler,
  automoderationHandler,
  achievementBackfillHandler,
  reputationInitializeHandler,
  reputationPromoteTrustedHandler,
]);
