export const ADMIN_PASSWORD_MIN_LENGTH = 8;

export type AdminPasswordChangeValidationError =
  | "required"
  | "too-short"
  | "confirmation-mismatch"
  | "same-password";

export const ADMIN_PASSWORD_CHANGE_ERROR_MESSAGES: Record<
  AdminPasswordChangeValidationError,
  string
> = {
  required: "Заполни текущий пароль, новый пароль и повтор.",
  "too-short": `Новый пароль должен быть не короче ${ADMIN_PASSWORD_MIN_LENGTH} символов.`,
  "confirmation-mismatch": "Новый пароль и повтор не совпадают.",
  "same-password": "Новый пароль должен отличаться от текущего.",
};

export function validateAdminPasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}) {
  if (!input.currentPassword || !input.newPassword || !input.newPasswordConfirmation) {
    return "required" satisfies AdminPasswordChangeValidationError;
  }

  if (input.newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return "too-short" satisfies AdminPasswordChangeValidationError;
  }

  if (input.newPassword !== input.newPasswordConfirmation) {
    return "confirmation-mismatch" satisfies AdminPasswordChangeValidationError;
  }

  if (input.currentPassword === input.newPassword) {
    return "same-password" satisfies AdminPasswordChangeValidationError;
  }

  return null;
}
