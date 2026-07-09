export const ACTIVITY_ACTOR_TYPES = ["admin", "author"] as const;
export const ACTIVITY_STATUSES = ["success", "failure"] as const;
export const ACTIVITY_SEVERITIES = ["info", "warning", "critical"] as const;

export const ACTIVITY_ENTITY_TYPES = [
  "access-profile",
  "author",
  "author-token",
  "cover-provider",
  "cover-settings",
  "franchise",
  "media-item",
  "review",
] as const;

export const ACTIVITY_ACTIONS = [
  "admin.login",
  "admin.login.failed",
  "admin.logout",
  "admin.password.changed",
  "author.login",
  "author.login.failed",
  "author-token.created",
  "author-token.revoked",
  "author-token.restored",
  "author-token.deleted",
  "media.created",
  "media.updated",
  "media.deleted",
  "media.published",
  "media.unpublished",
  "media-review.approved",
  "media-review.rejected",
  "review.approved",
  "review.rejected",
  "review.hidden",
  "review.deleted",
  "franchise.created",
  "franchise.updated",
  "franchise.deleted",
  "franchise.media.attached",
  "franchise.media.detached",
  "author.created",
  "author.updated",
  "author.blocked",
  "author.unblocked",
  "author.deleted",
  "cover-settings.updated",
  "cover-providers.updated",
  "cover-provider-credentials.updated",
] as const;

export type ActivityActorType = (typeof ACTIVITY_ACTOR_TYPES)[number];
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export type ActivitySeverity = (typeof ACTIVITY_SEVERITIES)[number];
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_ACTOR_TYPE_LABELS = {
  admin: "Админ",
  author: "Автор",
} satisfies Record<ActivityActorType, string>;

export const ACTIVITY_STATUS_LABELS = {
  success: "Успешно",
  failure: "Ошибка",
} satisfies Record<ActivityStatus, string>;

export const ACTIVITY_SEVERITY_LABELS = {
  info: "Инфо",
  warning: "Важно",
  critical: "Критично",
} satisfies Record<ActivitySeverity, string>;

export const ACTIVITY_ENTITY_TYPE_LABELS = {
  "access-profile": "Профиль доступа",
  author: "Автор",
  "author-token": "Токен автора",
  "cover-provider": "Провайдер обложек",
  "cover-settings": "Настройки обложек",
  franchise: "Серия",
  "media-item": "Запись",
  review: "Рецензия",
} satisfies Record<ActivityEntityType, string>;

export const ACTIVITY_ACTION_LABELS = {
  "admin.login": "Вход админа",
  "admin.login.failed": "Неудачный вход админа",
  "admin.logout": "Выход админа",
  "admin.password.changed": "Смена пароля админа",
  "author.login": "Вход автора",
  "author.login.failed": "Неудачный вход автора",
  "author-token.created": "Токен автора создан",
  "author-token.revoked": "Токен автора отозван",
  "author-token.restored": "Токен автора восстановлен",
  "author-token.deleted": "Токен автора удален",
  "media.created": "Запись создана",
  "media.updated": "Запись изменена",
  "media.deleted": "Запись удалена",
  "media.published": "Запись опубликована",
  "media.unpublished": "Запись снята с публикации",
  "media-review.approved": "Заявка записи одобрена",
  "media-review.rejected": "Заявка записи отклонена",
  "review.approved": "Рецензия одобрена",
  "review.rejected": "Рецензия отклонена",
  "review.hidden": "Рецензия скрыта",
  "review.deleted": "Рецензия удалена",
  "franchise.created": "Серия создана",
  "franchise.updated": "Серия изменена",
  "franchise.deleted": "Серия удалена",
  "franchise.media.attached": "Запись добавлена в серию",
  "franchise.media.detached": "Запись убрана из серии",
  "author.created": "Автор создан",
  "author.updated": "Автор изменен",
  "author.blocked": "Автор заблокирован",
  "author.unblocked": "Автор разблокирован",
  "author.deleted": "Автор удален",
  "cover-settings.updated": "Настройки обложек изменены",
  "cover-providers.updated": "Провайдеры обложек изменены",
  "cover-provider-credentials.updated": "Авторизация провайдера сохранена",
} satisfies Record<ActivityAction, string>;

const SECURITY_ACTIVITY_ACTIONS = new Set<ActivityAction>([
  "admin.login",
  "admin.login.failed",
  "admin.logout",
  "admin.password.changed",
  "author.login",
  "author.login.failed",
  "author-token.created",
  "author-token.revoked",
  "author-token.restored",
  "author-token.deleted",
]);

const CRITICAL_ACTIVITY_ACTIONS = new Set<ActivityAction>([
  "admin.password.changed",
  "author-token.revoked",
  "author-token.deleted",
  "media.deleted",
  "review.deleted",
  "franchise.deleted",
  "author.blocked",
  "author.deleted",
  "cover-provider-credentials.updated",
]);

const SECRET_KEY_PARTS = [
  "authorization",
  "cookie",
  "credential",
  "encryptedpayload",
  "password",
  "secret",
  "session",
  "token",
];

export function isActivityActorType(value: string): value is ActivityActorType {
  return ACTIVITY_ACTOR_TYPES.some((actorType) => actorType === value);
}

export function isActivityAction(value: string): value is ActivityAction {
  return ACTIVITY_ACTIONS.some((action) => action === value);
}

export function isActivityEntityType(value: string): value is ActivityEntityType {
  return ACTIVITY_ENTITY_TYPES.some((entityType) => entityType === value);
}

export function isActivitySeverity(value: string): value is ActivitySeverity {
  return ACTIVITY_SEVERITIES.some((severity) => severity === value);
}

export function isActivitySecurityAction(action: ActivityAction) {
  return SECURITY_ACTIVITY_ACTIONS.has(action);
}

export function getDefaultActivitySeverity(input: {
  action: ActivityAction;
  status: ActivityStatus;
}): ActivitySeverity {
  if (CRITICAL_ACTIVITY_ACTIONS.has(input.action)) {
    return "critical";
  }

  if (input.status === "failure") {
    return "warning";
  }

  return "info";
}

export function getActivityActionLabel(action: string) {
  return isActivityAction(action) ? ACTIVITY_ACTION_LABELS[action] : action;
}

export function getActivityEntityTypeLabel(entityType: string | null) {
  return entityType && isActivityEntityType(entityType)
    ? ACTIVITY_ENTITY_TYPE_LABELS[entityType]
    : entityType;
}

export function formatActivityLogDate(
  value: Date | string,
  options?: {
    timeZone?: string;
  },
) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: options?.timeZone,
  }).format(date);
}

function isSecretMetadataKey(key: string) {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();

  return SECRET_KEY_PARTS.some((secretKeyPart) => normalizedKey.includes(secretKeyPart));
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return sanitizeActivityLogMetadata(value as Record<string, unknown>, depth + 1);
  }

  return String(value);
}

export function sanitizeActivityLogMetadata(
  metadata: Record<string, unknown> | null | undefined,
  depth = 0,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  const sanitizedEntries = Object.entries(metadata)
    .filter(([key]) => !isSecretMetadataKey(key))
    .map(([key, value]) => [key, sanitizeMetadataValue(value, depth)] as const)
    .filter(([, value]) => value !== undefined);

  return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : null;
}
