"use server";

import { revalidatePath } from "next/cache";

import {
  getAdminUserCredentialsById,
  updateAdminPasswordHash,
} from "@/db/queries/admin-users";
import {
  getCoverProviderCredentialStatuses,
  updateCoverProviderRateLimits,
  updateCoverProviderSettings,
  updateCoverProviderCredentials,
  updateCoverSettings,
} from "@/db/queries/cover-settings";
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

export type ChangeAdminPasswordState = {
  error: string | null;
  success: string | null;
};

export type UpdateCoverSettingsState = {
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
      return {
        error: "Текущий пароль указан неверно.",
        success: null,
      };
    }

    const passwordHash = await hashPassword(newPassword);
    const updatedAt = await updateAdminPasswordHash(adminUser.id, passwordHash);

    if (!updatedAt) {
      return {
        error: "Админ не найден.",
        success: null,
      };
    }

    await setAdminSessionCookie(adminUser.id, updatedAt.getTime());
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
  await requireAdminUser();

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
  revalidatePath("/admin/settings/covers");

  return {
    error: null,
    success: "Лимиты обложек обновлены.",
  };
}

export async function updateCoverProviderSettingsAction(
  _previousState: UpdateCoverProviderSettingsState,
  formData: FormData,
): Promise<UpdateCoverProviderSettingsState> {
  await requireAdminUser();

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
  revalidatePath("/admin/settings/covers");

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
  revalidatePath("/admin/settings/covers");

  return {
    error: null,
    success: "Авторизация провайдера сохранена.",
  };
}
