import { InvalidProviderSnapshotError, OpenLibraryWorkRedirectError } from "./book-adapters";

export type SnapshotItemError = { id: number; code: string; targetExternalId?: string };

export function gameSnapshotDiagnosticMessage(code: string) {
  const messages: Record<string, string> = {
    "genres-differ": "Состав жанров в снимке отличается от прежних данных источника.",
    "platforms-differ": "Состав платформ в снимке отличается от прежних данных источника.",
    "companies-differ": "Состав разработчиков или издателей отличается либо ещё не подтверждён сохранёнными данными.",
    "genre-links-differ": "Применение снимка изменило бы существующие связи жанров.",
    "platform-links-differ": "Применение снимка изменило бы существующие связи платформ.",
    "unverified-genres": "Для части жанров ещё нет готовых соответствий или существующих заявок этой записи.",
    "unverified-platforms": "Для части платформ ещё нет готовых соответствий или существующих заявок этой записи.",
  };
  return messages[code] ?? "Обнаружено расхождение. Связи и заявки записи сохранены.";
}

export function bggSnapshotDiagnosticMessage(code: string) {
  const messages: Record<string, string> = {
    "genres-differ": "Состав категорий BGG отличается от прежних данных.",
    "creators-differ": "Состав авторов или художников отличается от прежних данных.",
    "genre-links-differ": "Применение снимка изменило бы существующие связи жанров.",
    "unverified-genres": "Для части жанров нет подтверждённых соответствий или существующих заявок записи.",
    "creator-links-differ": "Применение снимка изменило бы существующие связи создателей.",
    "facts-differ": "Характеристики настольной игры отличаются от сохранённых данных.",
  };
  return messages[code] ?? "Обнаружено расхождение. Связи и заявки записи сохранены.";
}

/** Keep the actual deferral cause visible without exposing exception text or response bodies. */
export function snapshotProviderDeferral(error: unknown, mediaItemId: number) {
  const transportCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const code = ["provider-daily-limit", "provider-rate-limit", "rate-limit-unavailable"].includes(transportCode)
    ? transportCode : error instanceof Error ? error.message : "";
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : NaN;
  const retryAfter = error && typeof error === "object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : NaN;
  const context = `Запись №${mediaItemId}.`;
  if (status === 202) {
    const deferSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60;
    return { message: `BGG готовит данные записи. ${context} Повтор через ${deferSeconds} сек.`, deferSeconds };
  }
  if (code === "provider-daily-limit") return {
    message: `Недостаточно суточной квоты для фоновой обработки с учётом резерва. ${context} Повтор через час.`,
    deferSeconds: 3600,
  };
  if (code === "rate-limit-unavailable") return {
    message: `Не удалось проверить квоту в Redis; запрос к API не отправлен. ${context} Повтор через 60 секунд.`,
    deferSeconds: 60,
  };
  if (status === 429 || code === "provider-rate-limit") {
    const deferSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60;
    return {
      message: `API источника вернул HTTP 429: ограничение частоты запросов. ${context} Повтор через ${deferSeconds} сек.`,
      deferSeconds,
    };
  }
  return null;
}

/** Store only controlled diagnostics; exception text may contain URLs or credentials. */
export function snapshotItemError(id: number, error: unknown): SnapshotItemError {
  if (error instanceof OpenLibraryWorkRedirectError) return { id, code: "open-library-work-moved", targetExternalId: error.targetExternalId };
  if (error instanceof InvalidProviderSnapshotError) return { id, code: "invalid-provider-response" };
  if (error instanceof SyntaxError) return { id, code: "invalid-provider-json" };
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : NaN;
  if (Number.isInteger(status) && status >= 400 && status <= 599) return { id, code: `provider-http-${status}` };
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    "BGG_SNAPSHOT_DIFFERENCE": "bgg-snapshot-difference",
    "GAME_SNAPSHOT_DIFFERENCE": "game-snapshot-difference",
    "INVALID_CREATOR_PROFILE_TARGET": "unsupported-profile", "INVALID_CREATOR_PROFILE_RESPONSE": "invalid-provider-response",
    "CREATOR_BINDING_MISSING": "missing-binding", "CREATOR_BINDING_AMBIGUOUS": "ambiguous-binding",
    "SNAPSHOT_ENTITY_NOT_FOUND": "creator-missing", "INVALID_CREATOR_SNAPSHOT": "invalid-provider-response",
    "PROVIDER_SOURCE_CHANGED": "source-changed", "provider-disabled": "provider-disabled", "migration-difference": "migration-difference",
    "INCOMPLETE_PROVIDER_SNAPSHOTS": "incomplete-snapshots", "PROVIDER_SNAPSHOT_MISSING": "missing-snapshot",
    "PROVIDER_SNAPSHOT_CHANGED": "snapshot-changed",
    "ANILIST_MEDIA_MISSING": "anilist-media-missing", "AMBIGUOUS_ANILIST_SNAPSHOTS": "anilist-ambiguous",
    "INVALID_ANILIST_ROSTER": "incomplete-snapshots", "ANILIST_GRAPHQL_ERROR": "invalid-provider-response",
    "INCOMPLETE_ANILIST_STAFF": "incomplete-snapshots", "INCOMPLETE_ANILIST_STUDIOS": "incomplete-snapshots",
    "ANILIST_SOURCE_CHANGED": "incomplete-snapshots", "CONFLICTING_ANILIST_IDENTITY": "invalid-provider-response",
    "INVALID_PROVIDER_SNAPSHOT_REFERENCES": "invalid-provider-response", "INVALID_PROVIDER_SNAPSHOT_TARGET": "invalid-provider-response",
    "Incomplete Open Library work response.": "incomplete-snapshots", "Incomplete Open Library author response.": "incomplete-snapshots",
    "Incomplete book contributor response.": "incomplete-snapshots",
  };
  return { id, code: known[message] ?? "snapshot-operation-failed" };
}

export function snapshotItemErrorMessage(error: SnapshotItemError): string {
  if (error.code === "open-library-work-moved" && error.targetExternalId && /^\/works\/OL[1-9]\d*W$/.test(error.targetExternalId)) {
    return `Open Library объединила книгу с ${error.targetExternalId}. Выберите актуальный источник в редакторе записи и создайте новый запуск обработки.`;
  }
  if (/^provider-http-[45]\d\d$/.test(error.code)) return `Провайдер вернул HTTP ${error.code.slice(-3)}.`;
  const messages: Record<string, string> = {
    "bgg-snapshot-difference": "Снимок BGG отличается от сохранённых данных. Связи и заявки не изменены. Проверьте расхождения перед явным применением.",
    "game-snapshot-difference": "Снимок отличается от сохранённых данных. Связи и заявки не изменены. Проверьте расхождения перед явным применением.",
    "unsupported-profile": "Получение этого внешнего профиля пока не поддерживается.",
    "missing-binding": "Нет подтверждённой внешней привязки.",
    "ambiguous-binding": "У создателя несколько активных привязок FantLab. Выберите одну.",
    "creator-missing": "Создатель больше не существует.",
    "invalid-provider-response": "Провайдер вернул данные другого ресурса или некорректный ответ.",
    "invalid-provider-json": "Ответ провайдера не удалось прочитать как JSON.",
    "source-changed": "Источник записи изменился во время обработки.",
    "provider-disabled": "Провайдер выключен в настройках.",
    "migration-difference": "Обнаружены расхождения с прежними данными записи.",
    "incomplete-snapshots": "Данные источника неполны. Запись не изменена.",
    "missing-snapshot": "Сохранённые данные не найдены. Сначала получите данные провайдера.",
    "snapshot-changed": "Сохранённые данные изменились во время обработки. Повторите попытку.",
    "missing-source": "У записи не указан поддерживаемый источник.",
    "anilist-media-missing": "В AniList не найдена запись с указанным MAL ID. Основной источник записи сохранён.",
    "anilist-ambiguous": "Найдено несколько снимков AniList с одним MAL ID. Требуется проверка привязки.",
  };
  return messages[error.code] ?? "Не удалось получить или применить данные. Подробная причина для этого запуска не сохранена.";
}
