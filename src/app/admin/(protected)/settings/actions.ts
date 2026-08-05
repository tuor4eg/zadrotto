"use server";

import { revalidatePath } from "next/cache";

import {
  getAdminUserCredentialsById,
  updateAdminPasswordHash,
} from "@/db/queries/admin-users";
import {
  getCoverProviderCredentialStatuses,
  updateCoverProviderImageSetting,
  updateCoverProviderRateLimits,
  updateCoverProviderSettings,
  updateCoverProviderCredentials,
  updateCoverSettings,
} from "@/db/queries/cover-settings";
import { updateArchiveSettings } from "@/db/queries/archive-settings";
import { requireAdminUser, setAdminSessionCookie } from "@/lib/auth/admin-auth";
import {
  ADMIN_PASSWORD_CHANGE_ERROR_MESSAGES,
  validateAdminPasswordChange,
} from "@/lib/admin/settings";
import { getAdminFormErrorCode, getAdminFormErrorMessage } from "@/lib/common/app-error-messages";
import {
  COVER_SETTINGS_ERROR_MESSAGES,
  parseCoverProviderRateLimitsFormInput,
  parseCoverProviderSettingsFormInput,
  parseCoverSettingsFormInput,
} from "@/lib/forms/cover-settings";
import { coverProviderRequiresCredentials } from "@/lib/covers/credential-definitions";
import { validateCoverProviderCredentials } from "@/lib/covers/credential-validation";
import { isCoverProviderCode } from "@/lib/covers/types";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";
import { parseMediaItemTitleAliasLimit } from "@/lib/media/title-aliases";
import { parseDailyDossierMinAverageScore } from "@/lib/main-page/daily-dossier-settings";
import {
  parseRecentlyViewedHistoryLimit,
  parseRecentlyViewedTtlDays,
} from "@/lib/main-page/recently-viewed-settings";
import {
  parseTopArchiveMinAverageScore,
  parseTopArchiveMinRatingsCount,
} from "@/lib/main-page/top-archive-settings";

export type ChangeAdminPasswordState = {
  error: string | null;
  success: string | null;
};

export type UpdateCoverSettingsState = {
  error: string | null;
  success: string | null;
};

export type UpdateArchiveSettingsState = {
  error: string | null;
  success: string | null;
};

export type UpdateCoverProviderCredentialsState = {
  error: string | null;
  success: string | null;
};

export type UpdateCoverProviderSettingsState = {
  error: string | null;
  success: string | null;
};

export async function updateCoverProviderImageSettingAction(
  providerCode: string,
  proxyImagesEnabled: boolean,
): Promise<UpdateCoverProviderSettingsState> {
  const adminUser = await requireAdminUser();
  if (!isCoverProviderCode(providerCode)) {
    return { error: "Неизвестный провайдер.", success: null };
  }
  try {
    await updateCoverProviderImageSetting({ providerCode, proxyImagesEnabled, updatedByAdminId: adminUser.id });
    await logActivity({
      action: "cover-provider-image-relay.updated",
      actorType: "admin",
      adminUserId: adminUser.id,
      entityType: "cover-provider",
      entityLabel: providerCode,
      message: proxyImagesEnabled
        ? "Серверная загрузка изображений провайдера включена."
        : "Серверная загрузка изображений провайдера выключена.",
      metadata: { providerCode, proxyImagesEnabled },
    });
  } catch (error) {
    console.error(error);
    return { error: getAdminFormErrorMessage(getAdminFormErrorCode(error)), success: null };
  }
  revalidatePath("/admin/tools/providers");
  return {
    error: null,
    success: proxyImagesEnabled
      ? "Изображения будут загружаться через сервер."
      : "Прямая загрузка изображений восстановлена.",
  };
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormStringsByPrefix(formData: FormData, prefix: string) {
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith(prefix) && typeof value === "string") {
      values[key.slice(prefix.length)] = value.trim();
    }
  }

  return values;
}

export async function updateArchiveSettingsAction(
  _previousState: UpdateArchiveSettingsState,
  formData: FormData,
): Promise<UpdateArchiveSettingsState> {
  const adminUser = await requireAdminUser();
  const mediaItemTitleAliasLimit = parseMediaItemTitleAliasLimit(
    getFormString(formData, "mediaItemTitleAliasLimit"),
  );
  const maxFranchiseDepth = Number(getFormString(formData, "maxFranchiseDepth"));
  const dailyDossierMinAverageScore = parseDailyDossierMinAverageScore(
    getFormString(formData, "dailyDossierMinAverageScore"),
  );
  const recentlyViewedHistoryLimit = parseRecentlyViewedHistoryLimit(
    getFormString(formData, "recentlyViewedHistoryLimit"),
  );
  const recentlyViewedTtlDays = parseRecentlyViewedTtlDays(
    getFormString(formData, "recentlyViewedTtlDays"),
  );
  const topArchiveMinAverageScore = parseTopArchiveMinAverageScore(
    getFormString(formData, "topArchiveMinAverageScore"),
  );
  const topArchiveMinRatingsCount = parseTopArchiveMinRatingsCount(
    getFormString(formData, "topArchiveMinRatingsCount"),
  );

  if (mediaItemTitleAliasLimit === null || dailyDossierMinAverageScore === null || recentlyViewedHistoryLimit === null || recentlyViewedTtlDays === null || topArchiveMinAverageScore === null || topArchiveMinRatingsCount === null || !Number.isInteger(maxFranchiseDepth) || maxFranchiseDepth < 2 || maxFranchiseDepth > 5) {
    return { error: "Проверьте ограничения общих настроек.", success: null };
  }

  try {
    await updateArchiveSettings({
      maxTitleAliases: mediaItemTitleAliasLimit,
      maxFranchiseDepth,
      dailyDossierMinAverageScore,
      recentlyViewedHistoryLimit,
      recentlyViewedTtlDays,
      topArchiveMinAverageScore,
      topArchiveMinRatingsCount,
      updatedByAdminId: adminUser.id,
    });
    await logActivity({
      action: "archive-settings.updated",
      actorType: "admin",
      adminUserId: adminUser.id,
      entityType: "archive-settings",
      entityId: 1,
      message: "Общие настройки обновлены.",
      metadata: {
        dailyDossierMinAverageScore,
        recentlyViewedHistoryLimit,
        recentlyViewedTtlDays,
        topArchiveMinAverageScore,
        topArchiveMinRatingsCount,
        mediaItemTitleAliasLimit,
        maxFranchiseDepth,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Franchise depth is below existing tree") {
      return { error: "Нельзя установить меньшую глубину: в дереве уже есть более глубокие серии.", success: null };
    }

    console.error(error);
    return {
      error: getAdminFormErrorMessage(getAdminFormErrorCode(error)),
      success: null,
    };
  }

  revalidatePath("/admin/settings/general");
  return { error: null, success: "Общие настройки сохранены." };
}

export async function changeAdminPasswordAction(
  _previousState: ChangeAdminPasswordState,
  formData: FormData,
): Promise<ChangeAdminPasswordState> {
  const adminUser = await requireAdminUser();
  const currentPassword = getFormString(formData, "currentPassword");
  const newPassword = getFormString(formData, "newPassword");
  const newPasswordConfirmation = getFormString(formData, "newPasswordConfirmation");
  const validationError = validateAdminPasswordChange({
    currentPassword,
    newPassword,
    newPasswordConfirmation,
  });

  if (validationError) {
    return {
      error: ADMIN_PASSWORD_CHANGE_ERROR_MESSAGES[validationError],
      success: null,
    };
  }

  try {
    const credentials = await getAdminUserCredentialsById(adminUser.id);
    const isValidCurrentPassword = credentials
      ? await verifyPassword(currentPassword, credentials.passwordHash)
      : false;

    if (!credentials || !isValidCurrentPassword) {
      await logActivity({
        action: "admin.password.changed",
        actorType: "admin",
        adminUserId: adminUser.id,
        status: "failure",
        message: "Неверный текущий пароль при смене пароля.",
      });
      return {
        error: "Текущий пароль указан неверно.",
        success: null,
      };
    }

    const passwordHash = await hashPassword(newPassword);
    const sessionInvalidatedAt = await updateAdminPasswordHash(adminUser.id, passwordHash);

    if (!sessionInvalidatedAt) {
      return {
        error: "Админ не найден.",
        success: null,
      };
    }

    await setAdminSessionCookie(adminUser.id, sessionInvalidatedAt.getTime());
    await logActivity({
      action: "admin.password.changed",
      actorType: "admin",
      adminUserId: adminUser.id,
      message: "Пароль админа обновлен.",
    });
  } catch (error) {
    console.error(error);

    return {
      error: getAdminFormErrorMessage(getAdminFormErrorCode(error)),
      success: null,
    };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/settings/administrator");

  return {
    error: null,
    success: "Пароль обновлен.",
  };
}

export async function updateCoverSettingsAction(
  _previousState: UpdateCoverSettingsState,
  formData: FormData,
): Promise<UpdateCoverSettingsState> {
  const adminUser = await requireAdminUser();

  const settings = parseCoverSettingsFormInput({
    candidateLimit: getFormString(formData, "candidateLimit"),
    tmdbResultScanLimit: getFormString(formData, "tmdbResultScanLimit"),
    coverMaxMegabytes: getFormString(formData, "coverMaxMegabytes"),
  });

  if (!settings.ok) {
    return {
      error: COVER_SETTINGS_ERROR_MESSAGES[settings.error],
      success: null,
    };
  }

  const providerRateLimits = parseCoverProviderRateLimitsFormInput(formData);

  if (!providerRateLimits.ok) {
    return {
      error: COVER_SETTINGS_ERROR_MESSAGES[providerRateLimits.error],
      success: null,
    };
  }

  try {
    await updateCoverSettings(settings.value);
    await updateCoverProviderRateLimits(providerRateLimits.value);
  } catch (error) {
    console.error(error);

    return {
      error: getAdminFormErrorMessage(getAdminFormErrorCode(error)),
      success: null,
    };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/tools/providers/limits");
  await logActivity({
    action: "cover-settings.updated",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "cover-settings",
    entityId: 1,
    message: "Параметры провайдеров обновлены.",
    metadata: {
      candidateLimit: settings.value.candidateLimit,
      tmdbResultScanLimit: settings.value.tmdbResultScanLimit,
      coverMaxBytes: settings.value.coverMaxBytes,
      providerRateLimitsCount: providerRateLimits.value.length,
    },
  });

  return {
    error: null,
    success: "Параметры провайдеров обновлены.",
  };
}

export async function updateCoverProviderSettingsAction(
  _previousState: UpdateCoverProviderSettingsState,
  formData: FormData,
): Promise<UpdateCoverProviderSettingsState> {
  const adminUser = await requireAdminUser();

  const providerSettings = parseCoverProviderSettingsFormInput(formData);

  if (!providerSettings.ok) {
    return {
      error: COVER_SETTINGS_ERROR_MESSAGES[providerSettings.error],
      success: null,
    };
  }

  const credentialStatuses = await getCoverProviderCredentialStatuses();
  const credentialStatusesByProviderCode = new Map(
    credentialStatuses.map((status) => [status.providerCode, status]),
  );
  const enabledProviderWithoutCredentials = providerSettings.value.find(
    (provider) =>
      provider.enabled &&
      coverProviderRequiresCredentials(provider.providerCode) &&
      !credentialStatusesByProviderCode.get(provider.providerCode)?.hasCredentials,
  );

  if (enabledProviderWithoutCredentials) {
    return {
      error: "Сначала авторизуйтесь у провайдера, потом его можно включить.",
      success: null,
    };
  }

  try {
    await updateCoverProviderSettings(providerSettings.value);
  } catch (error) {
    console.error(error);

    return {
      error: getAdminFormErrorMessage(getAdminFormErrorCode(error)),
      success: null,
    };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/tools/providers");
  await logActivity({
    action: "cover-providers.updated",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "cover-provider",
    message: "Провайдеры обновлены.",
    metadata: {
      providersCount: providerSettings.value.length,
    },
  });

  return {
    error: null,
    success: "Провайдеры обновлены.",
  };
}

export async function updateCoverProviderCredentialsAction(
  _previousState: UpdateCoverProviderCredentialsState,
  formData: FormData,
): Promise<UpdateCoverProviderCredentialsState> {
  const adminUser = await requireAdminUser();
  const providerCode = getFormString(formData, "providerCode");

  if (!isCoverProviderCode(providerCode)) {
    return {
      error: "Неизвестный провайдер.",
      success: null,
    };
  }

  const values = getFormStringsByPrefix(formData, "credential:");
  const validation = await validateCoverProviderCredentials({
    providerCode,
    values,
  });

  if (!validation.ok) {
    const errorMessages = {
      "empty-credentials": "Заполни все поля авторизации.",
      "invalid-credentials": "Провайдер не принял эти данные авторизации.",
      "provider-unavailable": "Не удалось проверить авторизацию: провайдер сейчас недоступен.",
      "unsupported-provider": "Для этого провайдера авторизация не настроена.",
    } as const;

    return {
      error: errorMessages[validation.error],
      success: null,
    };
  }

  const result = await updateCoverProviderCredentials({
    adminId: adminUser.id,
    providerCode,
    values,
  });

  if (!result.ok) {
    const errorMessages = {
      "empty-credentials": "Заполни все поля авторизации.",
      "missing-master-key": "Не задан COVER_PROVIDER_CREDENTIALS_KEY.",
      "unsupported-provider": "Для этого провайдера авторизация не настроена.",
    } as const;

    return {
      error: errorMessages[result.error],
      success: null,
    };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/tools/providers");
  await logActivity({
    action: "cover-provider-credentials.updated",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "cover-provider",
    entityLabel: providerCode,
    message: "Авторизация провайдера сохранена.",
    metadata: {
      providerCode,
    },
  });

  return {
    error: null,
    success: "Авторизация провайдера сохранена.",
  };
}
