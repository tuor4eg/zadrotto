"use server";

import { revalidatePath } from "next/cache";

import {
  getAdminUserCredentialsById,
  updateAdminPasswordHash,
} from "@/db/queries/admin-users";
import { requireAdminUser, setAdminSessionCookie } from "@/lib/admin-auth";
import {
  ADMIN_PASSWORD_CHANGE_ERROR_MESSAGES,
  validateAdminPasswordChange,
} from "@/lib/admin-settings";
import { getAdminFormErrorCode, getAdminFormErrorMessage } from "@/lib/app-error-messages";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ChangeAdminPasswordState = {
  error: string | null;
  success: string | null;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
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
  revalidatePath("/admin/settings");

  return {
    error: null,
    success: "Пароль обновлен.",
  };
}
