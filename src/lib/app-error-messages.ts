const DATABASE_UNAVAILABLE_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "53300",
  "53400",
  "57P01",
  "57P02",
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

export const ADMIN_FORM_ERROR_MESSAGES = {
  "service-unavailable": "503: сервис временно недоступен.",
  "operation-failed": "503: сервис временно недоступен.",
} as const;

export type AdminFormErrorCode = keyof typeof ADMIN_FORM_ERROR_MESSAGES;

function getErrorField(error: unknown, field: "code" | "message" | "cause") {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return null;
  }

  return (error as Record<typeof field, unknown>)[field];
}

export function isUniqueViolation(error: unknown) {
  return getErrorField(error, "code") === "23505";
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  const code = getErrorField(error, "code");

  if (typeof code === "string" && DATABASE_UNAVAILABLE_ERROR_CODES.has(code)) {
    return true;
  }

  const message = getErrorField(error, "message");

  if (
    typeof message === "string" &&
    /(connect|connection|database|timeout|terminated|refused|unavailable)/i.test(message)
  ) {
    return true;
  }

  const cause = getErrorField(error, "cause");

  return cause ? isDatabaseUnavailableError(cause) : false;
}

export function getAdminFormErrorCode(error: unknown): AdminFormErrorCode {
  return isDatabaseUnavailableError(error) ? "service-unavailable" : "operation-failed";
}

export function getAdminFormErrorMessage(code?: string) {
  return code && code in ADMIN_FORM_ERROR_MESSAGES
    ? ADMIN_FORM_ERROR_MESSAGES[code as AdminFormErrorCode]
    : null;
}

export function getRuntimeErrorTitle() {
  return "503";
}

export function getRuntimeErrorMessage() {
  return "Сервис временно недоступен.";
}
