# Technical Debt Audit

Аудит read-only по рабочему дереву репозитория на 2026-09-23. Код не менялся. Выводы ниже опираются на конкретные модули. Там, где поведение зависит от данных production (`jobs.enabled`, строки `author_sessions.auth_method`), это отмечено как needs verification.

## Executive summary

Проект — один Next.js App Router приложение без монорепо-пакетов. Домен собран вокруг `MediaItem`, авторского кабинета и админки. Данные — Drizzle/Postgres (`src/db/schema.ts`, 67 таблиц). Фон — одна очередь `job_runs` плюс три outbox: domain events, email, Telegram.

Значимого заброшенного слоя нет. Старый HTTP-cron для email уже снят: пустые каталоги `src/app/api/internal/auth-cleanup` и `src/app/api/internal/auth-email-outbox`, тесты явно запрещают `email-worker` / `AUTH_EMAIL_WORKER_SECRET`. Живой runtime — `src/lib/jobs/handlers.ts` и процессы `src/jobs/scheduler.ts` / `src/jobs/worker.ts`.

Явные кандидаты на удаление маленькие: неиспользуемые парсеры размера страницы архива, пустые каталоги старых internal route, повторный spread `timestamps()` в `mediaItems`. Крупного мёртвого домена нет.

Основные источники стоимости изменений:

- запись, модерация и доменные события живут в больших query-модулях (`src/db/queries/franchises.ts`, `src/db/queries/media-items.ts`), а не в отдельном слое use-case;
- побочные эффекты идут тремя каналами (domain events, email outbox, notification transport outbox);
- cover-провайдеры ходят во внешние API без общего timeout;
- `friend.accepted` пишется в outbox, но ни один consumer его не обрабатывает;
- demo-оценка и импорт demo-профиля не проходят через `parseRatingScoreInput`.

Архитектурные расхождения — это смена поколений, которая уже в основном завершена (jobs вместо curl-cron), и незаконченный слой `src/db/operations` рядом с записью в `src/db/queries`.

## Architecture map

Одно приложение `zadrotto`. Слои:

| Слой | Где | Ответственность |
|---|---|---|
| UI / RSC / Server Actions | `src/app/**` | публичные страницы, `/author`, `/admin`, route handlers |
| Доменные правила и адаптеры | `src/lib/<domain>/**` | auth, covers, AI, jobs, events, notifications, achievements, quizzes, demo |
| Доступ к данным | `src/db/queries/*` (~50 файлов) | чтение и почти все записи |
| Транзакционные сценарии | `src/db/operations/*` (3 файла) | auth, лимит приватных записей, импорт demo |
| Схема | `src/db/schema.ts` | Postgres |
| Фон | `src/jobs/scheduler.ts`, `src/jobs/worker.ts` | poll очереди |
| Инфраструктура | `src/lib/services/{postgres,redis,minio}.ts` | клиенты |

`src/db/queries` — фактический persistence-слой. Имя «queries» не означает read-only: например `accept`-путь в `src/db/queries/friends.ts` пишет строку и вызывает `appendEvent`.

### Публичный архив и MediaItem

Ответственность: каталог записей, серии (franchises), носители, публикация, витрина.

Entry points: `src/app/page.tsx`, `src/app/archive/page.tsx`, `src/app/media/[code]/page.tsx`, `src/app/series/page.tsx`, `src/app/admin/(protected)/media/actions.ts`, `src/app/author/(protected)/media/actions.ts`.

Зависимости: `src/db/queries/media-items.ts`, `src/db/queries/franchises.ts`, `src/lib/media/*`, `src/lib/covers/*`, visibility типов медиа, rating stats.

Кто зависит: рецензии, викторины, главная, mentions (`src/lib/inline-mentions/*`, `src/app/api/mentions/search/route.ts`), ачивки через события.

### Авторы и auth

Ответственность: админская HMAC-cookie сессия и авторская DB-сессия `author_session_v2`. Вход паролем и access token. Регистрация, email challenges, Turnstile.

Entry points: `src/lib/auth/admin-auth.ts` (`requireAdminUser`), `src/lib/auth/author-auth.ts` (`requireAuthor`), `src/app/author/login/actions.ts`, `src/db/operations/author-auth.ts`, `src/app/admin/(protected)/author-tokens/actions.ts`.

`AUTHOR_AUTH_METHODS` в `src/lib/auth/author-account-model.ts`: `"password" | "access_token" | "telegram"`. Runtime выставляет `password` (`src/app/author/login/actions.ts`) и `access_token` (дефолт `setAuthorSessionCookie` в `src/lib/auth/author-auth.ts`). Присваивания `authMethod: "telegram"` в `src/` нет. Telegram в проекте — транспорт уведомлений (`src/lib/notifications/transports/telegram-api.ts`), не логин.

Кто зависит: почти все персональные и админские мутации.

### Рецензии и оценки

Ответственность: вклад автора (`contributions` / `contributionReviews`), оценки 10…100.

Entry points: `src/app/reviews/actions.ts`, `src/lib/forms/contribution-review.ts`, `src/app/ratings/actions.ts`, `src/lib/ratings/score.ts`, `src/db/queries/ratings.ts`, `src/db/queries/contribution-reviews.ts`.

Кто зависит: публичный каталог рецензий, ачивки (`rating.created`, `review.published`), уведомления (`review.submitted` / `review.approved`).

### Обложки и метаданные

Ответственность: поиск обложек и фактов у внешних каталогов, файлы в MinIO, backfill/refresh jobs.

Entry points: `src/app/api/cover-candidates/route.ts`, `src/app/api/media-title-candidates/route.ts`, `src/app/api/media-title-metadata/route.ts`, `src/app/api/provider-image/route.ts`, `src/lib/covers/registry.ts`, `src/lib/covers/providers/*`.

Провайдеры в коде: tmdb, igdb, rawg, jikan, anilist, comic-vine, fantlab, open-library, google-books, roblox.

### AI

Ответственность: сценарии `suggest_series` и editorial summary. Не фундамент домена.

Entry points: `src/lib/ai/service.ts`, `src/lib/ai/registry.ts` (OpenRouter и DeepSeek), `src/app/api/media/suggest-franchises/route.ts`, jobs `media.editorial-summary-*` в `src/lib/jobs/handlers.ts`.

Пустой каталог `src/app/api/admin/media/suggest-franchises` без `route.ts`. Живой endpoint — `src/app/api/media/suggest-franchises/route.ts`.

### Уведомления, ачивки, друзья, викторины, багрепорты

- Уведомления: `src/lib/notifications/consumer.ts`, inbox API `src/app/api/notifications/route.ts`, доставка `src/lib/notifications/outbox-delivery.ts`.
- Ачивки: `src/lib/achievements/consumer.ts`, `src/lib/achievements/service.ts`, job `achievements.backfill`.
- Друзья: `src/db/queries/friends.ts`, `src/app/users/actions.ts`.
- Викторины: `src/lib/quizzes/model.ts`, `src/db/queries/quizzes.ts`, `src/app/quizzes/*`.
- Багрепорты: `src/app/api/bug-reports/route.ts`, `src/lib/bug-reports/model.ts`.

Связь между ними — domain events (`src/lib/domain-events/catalog.ts`, registry в `src/lib/domain-events/registry.ts`). Consumers ровно два: `achievementDomainEventConsumer` и `notificationDomainEventConsumer`.

### Demo / user-state

Три режима: plain / demo / authorized. Локальный профиль и одноразовый импорт: `src/lib/user-state/*`, `src/app/demo-profile/actions.ts`, `src/db/operations/demo-profile-import.ts`.

### Редакция

Подборки и document blocks: `src/db/queries/editorial-collections.ts`, `src/db/queries/editorial-documents.ts`, `src/app/admin/(protected)/collections/actions.ts`, `src/app/collections/[slug]`.

### Jobs

Единый registry `jobHandlerRegistry` в `src/lib/jobs/handlers.ts`. Типы:

- `auth.email-outbox-delivery`, `auth.cleanup`
- `jobs.cleanup-history`
- `media.cover-thumbnails-backfill`, `media.metadata-backfill`, `media.metadata-refresh`, `media.rating-stats-reconcile`
- `media.editorial-summary-sweep`, `media.editorial-summary-generate` (`schedulable: false`)
- `domain-events.dispatch`
- `notifications.transport-delivery`
- `achievements.backfill` (`schedulable: false`)

Отдельной второй очереди в runtime нет.

### Authz / storage / cache

- Админ: cookie-сессия, проверка внутри actions через `requireAdminUser`.
- Автор: opaque session в БД.
- Файлы: MinIO (`src/lib/services/minio.ts`), прокси `src/app/covers/[...objectKey]/route.ts`, `src/app/avatars/[...objectKey]/route.ts`.
- Redis: rate limits и часть пользовательского состояния (`src/lib/services/redis.ts`, `src/lib/rate-limits/redis.ts`). При недоступности клиент возвращает `null`.
- Валидация форм: ручные парсеры `src/lib/forms/*` и локальные проверки в actions. Zod в `src/` не используется.

### Неоднородность

- `src/db/operations` покрывает три сценария. Остальные мутации и `appendEvent` остаются в `queries`.
- Access token всё ещё рабочий вход (`src/app/author/token/author-token-login-form.tsx`, значение поля `legacy-token`). Это не stub: админ выпускает токены.
- Email-доставка — отдельный outbox и job. Остальные продуктовые side effects — domain events, затем Telegram outbox.
- Cover HTTP: общий `fetchJson` / `fetchSearchJson` без timeout; Roblox — свой клиент с AbortController 8s; AI/Resend/Telegram/Turnstile — со своими timeout.
- Совместимость URL: редиректы franchises → series в `next.config.ts`, `?review=` на `src/app/media/[code]/page.tsx`, страницы-редиректы автора (`src/app/author/onboarding/page.tsx` и settings). Это живые compatibility-слои, не мёртвый код.

## Removal candidates

### Candidate: парсеры размера страницы архива

Files:

- `src/lib/archive/tile-grid-capacity.ts` — `parseArchiveListPageSize`, `parseArchiveCatalogPageSize`, `clampArchiveListPageSize`
- `tests/archive-tile-grid-capacity.test.ts` — вызывает только `parseArchiveCatalogPageSize`

Evidence:

- `clampArchiveListPageSize` встречается только в определении.
- `parseArchiveListPageSize` вызывается только из `parseArchiveCatalogPageSize`.
- Production берёт размер через `getArchiveListPageSize` (`src/components/archive/archive-list-tile-grid.tsx`) и `getArchiveCatalogPageSize` (`src/components/archive/adaptive-archive-page-size-sync.tsx`).
- Страница архива парсит номер страницы через `parsePage` из `src/lib/common/pagination.ts`.

Why it looks obsolete:

- Функции парсинга query-параметра pageSize не подключены к маршрутам.

Possible hidden usage:

- Прямых dynamic import этих имён нет. Jobs и `tools/` их не вызывают.

How to verify safely:

- Повторить поиск символов по репозиторию, включая тесты.
- Удалить функции и прогнать `tests/archive-tile-grid-capacity.test.ts` после правки теста.

Confidence:

- high

Removal risk:

- low

### Candidate: пустые каталоги старых internal route

Files:

- `src/app/api/internal/auth-cleanup/`
- `src/app/api/internal/auth-email-outbox/`
- `src/app/api/admin/media/suggest-franchises/`

Evidence:

- В каталогах нет `route.ts` и других файлов (`find` по пустым директориям).
- `tests/email-automation.test.ts` и `tests/resend-email.test.ts` требуют отсутствия `email-worker`, `auth-cleanup-worker`, `AUTH_EMAIL_WORKER_SECRET` в compose/env/readme.
- Живая доставка email — handler `auth.email-outbox-delivery` в `src/lib/jobs/handlers.ts`.
- Живой suggest-franchises — `src/app/api/media/suggest-franchises/route.ts`.

Why it looks obsolete:

- App Router не создаёт endpoint без `route.ts`. Каталоги — следы снятого HTTP-cron и старого admin path.

Possible hidden usage:

- Внешний cron, который всё ещё бьёт в эти URL. Код такого клиента в репозитории не найден. Needs verification по access-логам, если они есть вне репо.

How to verify safely:

- Убедиться, что в deploy-конфиге нет curl на `/api/internal/auth-*`.
- Удаление пустых каталогов не меняет маршруты Next.js.

Confidence:

- high для «маршрута в приложении нет»
- medium для «снаружи никто не стучится»

Removal risk:

- low

### Candidate: повторный `timestamps()` в `mediaItems`

Files:

- `src/db/schema.ts`, `mediaItems`, два `...timestamps()` (около строк 1289 и 1294)

Evidence:

- `timestamps()` возвращает `createdAt` и `updatedAt`. Второй spread в том же object literal затирает первый. В SQL это не две пары колонок.

Why it looks obsolete:

- Первый spread не влияет на схему.

Possible hidden usage:

- Нет. Это не колонка и не migration.

How to verify safely:

- Сравнить сгенерированный Drizzle snapshot: набор колонок `media_items` не должен измениться после удаления первого spread.

Confidence:

- high

Removal risk:

- low

### Candidate: событие `friend.accepted` без consumer

Files:

- запись: `src/db/queries/friends.ts` (`type: "friend.accepted"`)
- каталог: `src/lib/domain-events/catalog.ts`
- consumers: `src/lib/achievements/consumer.ts`, `src/lib/notifications/consumer.ts` — типа нет в `eventTypes`
- `src/lib/achievements` не содержит `friend` / `friendship`

Evidence:

- `domainEventConsumerRegistry.forType("friend.accepted")` вернёт пустой список: тип не зарегистрирован ни в одном consumer.
- `dispatchDomainEvent` всё равно пометит outbox dispatched после пустого цикла consumers.

Why it looks obsolete:

- Событие пишется и доставляется, но текущие side effects от него не зависят.

Possible hidden usage:

- Строки остаются в `domain_events` как история.
- Будущая ачивка «друзья» может опереться на уже накопленные события. В каталоге ачивок такого правила сейчас нет.
- Внешние читатели таблицы вне этого репозитория. Needs verification.

How to verify safely:

- Не удалять тип, пока не решено, нужна ли история для будущего consumer.
- Если продукт не ждёт side effect, можно перестать писать событие отдельным изменением и оставить старые строки.

Confidence:

- medium (нет текущего consumer — доказано; «можно удалить» — нет, пока история может быть нужна)

Removal risk:

- medium

### Candidate: значение auth method `telegram`

Files:

- `src/lib/auth/author-account-model.ts` — `AUTHOR_AUTH_METHODS`
- `src/db/schema.ts` — check `auth_method in ('password', 'access_token', 'telegram')`

Evidence:

- Поиск `authMethod:` в `src/` не находит `"telegram"`.
- Telegram используется как `transport` уведомлений, это другая колонка.

Why it looks obsolete:

- В коде нет логина, который создаёт сессию с этим методом.

Possible hidden usage:

- Уже существующие строки `author_sessions` / identities со значением `telegram` в production. Needs verification SQL.
- Намеренный задел под будущий логин. Удаление потребует миграции check constraint.

How to verify safely:

- `select auth_method, count(*) from author_sessions group by 1` и то же для identities, если колонка там есть.
- Не снимать значение из check, пока запрос не показал 0 строк.

Confidence:

- high, что runtime-логина нет
- low, что значение можно удалить из схемы без проверки БД

Removal risk:

- high для схемы, low для «не строить на этом новый код»

Не являются dead code (проверено и оставлено в системе):

- `getMediaTypeOptions` в `src/db/queries/media-types.ts` помечен `@deprecated`, но это живой alias `getAllMediaTypeOptions` с множеством импортов в админке и типах форм.
- Access-token логин и редиректы `/franchises`, `/author/onboarding`, `?review=`.
- `DEPRECATED_MODEL_IDS` в `src/lib/ai/providers/deepseek.ts` — фильтр каталога моделей, не мёртвый модуль.
- Fallback `legacyMediaItem` в `src/lib/activity-logs/model.ts` — чтение старых payload activity log.
- npm-зависимости из `package.json` имеют импорты в `src/` или `tools/` (moment — только `src/lib/authors/experience-date.ts`; papaparse — `tools/import-games-csv.ts`).
- `TODO` / `FIXME` / `HACK` в `src/` и `tools/` не найдены.
- `test.skip` / `it.skip` / `describe.skip` в `tests/` не найдены.

## Duplication

### Duplication: шкала оценки 1…10 ↔ 10…100

Files:

- `src/lib/ratings/score.ts` — `RATING_SCORE_VALUES`, `parseRatingScoreInput` (границы 10…100, шаг 10)
- `src/components/ui/rating-score-buttons.tsx` — `RATING_BUTTON_SCORES` (10, 20, … 100)
- `src/app/author-rating-form.tsx` — demo-submit: `Math.round(Number(rawScore) * 10)` без проверки шага и границ
- `src/app/ratings/actions.ts` и `src/app/author/(protected)/media/actions.ts` — сервер через `parseRatingScoreInput`
- `src/db/operations/demo-profile-import.ts` — вставляет `entry.score` как есть

Duplicated responsibility:

- Допустимая лестница оценки и перевод пользовательского числа в хранимый score.

Current differences:

- Сервер отклоняет значение вне лестницы.
- Demo-форма считает `* 10` и, если число не `null`, сохраняет его в локальный профиль.
- Импорт пишет score в `ratings` внутри одной транзакции. Check в БД (`score % 10 = 0`, диапазон 10…100) при невалидном score откатит весь импорт, не одну строку.

Risk of divergence:

- Обычные кнопки отдают значения лестницы, поэтому UI-путь совпадает.
- Испорченный localStorage с score вне лестницы может уронить весь `importDemoProfile`.

Suggested consolidation:

- Перед записью demo и перед insert импорта прогонять score через ту же проверку, что `parseRatingScoreInput` (или общий predicate). Невалидные demo-оценки пропускать как skipped, не валить транзакцию.

Benefit:

- Один инвариант оценки на сервере, в demo и при импорте.

Refactoring risk:

- low

### Duplication: свёртка распределения оценок

Files:

- `src/db/queries/ratings.ts` (около 168–190)
- `src/db/queries/friends.ts` (около 332–350)

Duplicated responsibility:

- Суммирование `scoreMediaTypeDistribution` в `scoreDistribution` и годов в `releaseYearDistribution`.

Current differences:

- У друзей рядом ещё reviews/contribution counts. Сама свёртка Map совпадает.

Risk of divergence:

- Низкий: это агрегация уже посчитанных строк, не правило публикации.

Suggested consolidation:

- Вынести fold только если один из запросов снова меняют. Отдельный проход ради этого не окупается.

Benefit:

- Меньше шанса поправить средний балл в одном профиле и забыть второй.

Refactoring risk:

- low

### Duplication: разбор номера страницы

Files:

- `src/lib/common/pagination.ts` — `parsePage`
- `src/app/admin/(protected)/achievements/page.tsx` — локальная `parsePage` с той же формулой
- `src/lib/admin/media-browser.ts` — локальный `parsePageSize` с тем же смыслом, что `parsePageSize` в common pagination, но со своим allowlist

Duplicated responsibility:

- Нормализация `page` / `pageSize` из query string.

Current differences:

- Локальный `parsePage` в achievements совпадает с общим (нечисло → 1).
- Media browser завязан на `ADMIN_MEDIA_BROWSER_PAGE_SIZE_OPTIONS`.

Risk of divergence:

- Низкий для page. Для pageSize allowlist и так разный по экранам — это не баг.

Suggested consolidation:

- Achievements page может звать общий `parsePage`. Media browser оставить, пока allowlist локальный.

Benefit:

- Одна реализация нижней границы страницы.

Refactoring risk:

- low

### Duplication: литерал статуса `published`

Files:

- константа `PUBLISHED_PUBLICATION_STATUS` в `src/lib/media/publication-status.ts`, её используют `media-items`, quizzes, reviews и другие запросы
- литерал `"published"` в `src/db/queries/friends.ts` (contributions и media items) и `src/db/operations/demo-profile-import.ts`

Duplicated responsibility:

- «запись/вклад видны публично».

Current differences:

- Сейчас значение одно и то же. Отдельного второго статуса нет.

Risk of divergence:

- Если константу когда-нибудь сменят или добавят синоним, friends и demo-import останутся на строке. Сейчас это теоретический риск.

Suggested consolidation:

- Заменить литералы при следующей правке этих файлов. Отдельным рефакторингом не заниматься.

Benefit:

- Поиск всех публичных фильтров по одному символу.

Refactoring risk:

- low

Не отмечено как дубль ответственности:

- повторяющиеся `requireAdminUser` / `requireAuthor` — один и тот же helper, не форк правила;
- OpenRouter и DeepSeek — два провайдера с разными URL и ошибками (`src/lib/ai/providers/openrouter.ts`, `src/lib/ai/providers/deepseek.ts`). Общий timeout уже в `src/lib/ai/timeout.ts` / `src/lib/ai/service.ts`. Сливать клиенты не стоит, пока API различаются;
- `normalizeSearchText` для человеческого текста уже централизован. `toLowerCase` на логинах и email — другой класс данных.

## Architectural hotspots

### Hotspot: query-модули серий и записей одновременно читают каталог, модерируют и пишут события

Files:

- `src/db/queries/franchises.ts` (~2166 строк): публичное дерево, админский CRUD, `reviewSubmittedFranchise`, `reviewSubmittedMediaItemFranchise`, авторские заявки
- `src/db/queries/media-items.ts` (~1972 строк): каталог, CRUD автора и админа, submit/review/delete, `getRelatedFranchiseSections`
- рядом `src/app/author/(protected)/media/actions.ts` (~1123 строк) и `src/app/admin/(protected)/media/actions.ts`

Current responsibility:

- Всё, что происходит с записью и серией от публичной выборки до смены `publication_status` и domain event.

Why this is a hotspot:

- Правило модерации, публичный фильтр и side effect лежат в одном файле. `src/db/operations` этот объём не забрал: там только auth, лимит черновиков и demo import.

Concrete maintenance problem:

- Правка публикации серии требует читать файл, в котором же поиск дубликатов, дерево и админские options. Легко задеть чужой SQL.

Example future change that would be painful:

- Новый статус между `submitted` и `published` или отдельное уведомление автору при отклонении серии: точки перехода размазаны по `franchises.ts`, `media-items.ts` и нескольким `actions.ts`.

Potential improvement:

- Не дробить файл «по размеру». Вынести только переходы публикации (submit/review/withdraw) в функции рядом с текущими queries, оставив чистые SELECT на месте. Новые события добавлять там же, не заводя четвёртый слой.

Expected benefit:

- Изменение модерации перестаёт требовать прокрутки каталожных запросов.

Risk:

- medium. Сигнатуры уже используются страницами и тестами. Механический перенос без смены SQL безопаснее, чем новый service layer.

### Hotspot: доставка domain events без попыток и dead letter

Files:

- `src/lib/domain-events/dispatcher.ts` — `recoverPendingDomainEvents`
- `src/lib/domain-events/queue.ts` — `enqueueDomainEventDispatch` хардкодит `DEFAULT_JOB_MAX_ATTEMPTS` (3)
- handler `domain-events.dispatch` в `src/lib/jobs/handlers.ts` объявляет `defaultMaxAttempts: 5`
- схема `domain_event_outbox`: нет колонки attempts в используемом recovery-пути

Current responsibility:

- Гарантия доставки событий в achievements и notifications.

Why this is a hotspot:

- Fast-path job и cron recovery — разные политики. Poison event остаётся `dispatched_at IS NULL` и логируется на каждом recovery.

Concrete maintenance problem:

- Нельзя отличить «ещё не доехало» от «падает всегда». Логи растут, очередь recovery каждый тик снова берёт ту же строку (`orderBy createdAt`, batch до 200).

Example future change that would be painful:

- Новый consumer, который стабильно бросает на старом payload. Он блокирует не весь batch (catch есть), но событие ретраится без потолка, пока строку не починят руками.

Potential improvement:

- Считать попытки на outbox-строке и после лимита писать `last_error` / не возвращать строку в recovery. Fast-path должен брать `defaultMaxAttempts` handler-а, а не глобальную тройку. Recovery при этом остаётся гарантией.

Expected benefit:

- Ограниченный шум и явный список застрявших событий.

Risk:

- medium. Нельзя помечать событие failed так, чтобы потерять единственную доставку при временном сбое БД.

### Hotspot: cover providers без общего timeout

Files:

- `src/lib/covers/providers/shared.ts` — `fetchJson`, `fetchSearchJson`: `fetch` без `AbortSignal`
- вызывающие: `tmdb.ts`, `rawg.ts`, `jikan.ts`, `anilist.ts`, `comic-vine.ts`, `fantlab.ts`, `open-library.ts`, `google-books.ts`, token IGDB
- исключение: `src/lib/covers/providers/roblox.ts` (свой timeout 8s)
- контраст: `src/lib/ai/timeout.ts`, `src/lib/auth/resend.ts` (10s), `src/lib/notifications/transports/telegram-api.ts` (10s), `src/lib/auth/turnstile-verification.ts` (5s)

Current responsibility:

- Синхронный поиск обложек и метаданных из server actions / API routes.

Why this is a hotspot:

- Зависший вендор держит request до таймаута платформы. `fetchJson` на `!response.ok` возвращает `null` без статуса, поэтому 404 и 500 для части metadata-путей выглядят одинаково.

Concrete maintenance problem:

- Нельзя поставить один retry/timeout policy: каждый новый провайдер копирует вызов `fetchSearchJson`.

Example future change that would be painful:

- Включить ещё один каталог или ужесточить rate limit. Поиск обложки в форме записи начинает висеть, а лог не отличает пустой ответ от HTTP-ошибки.

Potential improvement:

- Добавить timeout в `fetchSearchJson` / `fetchJson` (как у Roblox), пробрасывать статус хотя бы в search-пути. Не строить общий «provider framework».

Expected benefit:

- Формы создания записи перестают зависеть от бесконечного fetch.

Risk:

- low–medium. Слишком короткий timeout увеличит ложные пустые выдачи. Начать с того же порядка, что у Roblox/Telegram (секунды, не миллисекунды).

### Hotspot: Telegram send до фиксации delivered

Files:

- `src/lib/notifications/outbox-policy.ts` — `Promise.all`: `send`, затем `complete`
- `src/lib/notifications/transports/telegram-api.ts` — нет idempotency key
- `src/db/queries/notification-transport-outbox.ts` — lease; просроченный `sending` снова claimable

Current responsibility:

- Доставка внешних уведомлений.

Why this is a hotspot:

- Успешный `sendMessage` и падение до `complete` дают повтор после истечения lease.

Concrete maintenance problem:

- Два `jobs-worker` или kill процесса посередине batch могут прислать один и тот же текст в чат дважды. `sanitizeError` режет bot token в тексте ошибки — это уже сделано. Повтора сообщения это не убирает.

Example future change that would be painful:

- Маршрут «заявка создана» включён в Telegram для всех модераций. Всплеск заявок плюс рестарт worker даёт дубли в редакционном чате.

Potential improvement:

- Оставить lease. Добавить идемпотентный ключ на стороне сообщения, если Telegram-метод это позволяет, или принимать дубли как известный предел и не наращивать параллелизм worker без нужды. Needs verification по актуальному Bot API, в коде ключа нет.

Expected benefit:

- Меньше двойных сообщений при рестарте.

Risk:

- medium. Неверный idempotency может наоборот проглатывать разные события.

Размер `src/app/media-rating-panel.tsx` (~79 KB) сам по себе hotspot-ом не считается: файл собирает carrier-specific варианты рейтинга (`AVERAGE_*_RATING_TONE_CLASS_NAMES`, `AUTHOR_*`). Дробить его ради длины не предлагается.

## Architecture generation mismatches

### Architecture generation mismatch

Old approach:

- Отдельные HTTP worker-ы для email/cleanup (`email-worker`, `AUTH_EMAIL_WORKER_SECRET`, curl). Каталоги `src/app/api/internal/auth-*` пустые.

New approach:

- Очередь `jobs` / `job_runs`, scheduler и worker, handlers в `src/lib/jobs/handlers.ts`. Seed `drizzle/0054_jobs_email_seed.sql` создаёт `auth-email-outbox-delivery` и `auth-cleanup` с `enabled=false`.

Files using old approach:

- Пустые каталоги internal API. Тесты фиксируют, что старые сервисы в compose больше не описаны.

Files using new approach:

- `src/jobs/scheduler.ts`, `src/jobs/worker.ts`, `src/lib/jobs/*`, админка `src/app/admin/(protected)/tools/jobs/*`.

Evidence that the newer approach is preferred:

- Миграция `drizzle/0055_remove_legacy_email_automation.sql` снимает таблицу `email_automation_jobs` и интервальные колонки. Текущая схема их не содержит. Доставка идёт через `deliverPendingAuthorEmails`.

Migration candidate:

- Удалить пустые каталоги. Не возвращать HTTP-cron.
- Включены ли email jobs в живой БД — needs verification. Seed делает `ON CONFLICT DO NOTHING`, то есть не выключает уже включённую строку и не включает выключенную.

Risk:

- low для удаления пустых каталогов
- high, если выключить email job, не проверив `jobs.enabled`

### Architecture generation mismatch

Old approach:

- Прямые побочные эффекты и отдельный email outbox (`email_outbox`, `src/lib/auth/email-outbox-delivery.ts`), настройки всё ещё называются `emailAutomationSettings` (`src/lib/auth/email-automation.ts`).

New approach:

- `runInDomainEventTransaction` (`src/db/transaction.ts`): запись в `domain_events` + `domain_event_outbox`, fast-path job `domain-events.dispatch`, consumers achievements/notifications, затем `notification_transport_outbox`.

Files using old approach:

- Регистрация, verify, reset: `src/db/operations/author-auth.ts` (`enqueueEncryptedEmail`), job `auth.email-outbox-delivery`.

Files using new approach:

- Рейтинги, рецензии, медиа, франшизы, викторины, багрепорты, друзья (`appendEvent` из query/operation модулей).

Evidence that the newer approach is preferred:

- Комментарий в `src/lib/domain-events/registry.ts`: consumers — инфраструктурные плагины, продюсеры их не знают. Новые продуктовые реакции (ачивки, inbox, Telegram) идут через каталог событий, не через прямой вызов транспорта. Тесты `tests/notifications.test.ts` проверяют, что consumer не зовёт Telegram API сам.

Migration candidate:

- Не переносить auth-email в domain events. Письма содержат зашифрованный payload и отдельные retry (`src/lib/auth/resend.ts`, idempotency `author-email-outbox-${id}`). Это другой контур.
- Имеет смысл только перестать называть настройки «automation», когда их снова трогают. Поведение от переименования не изменится.

Risk:

- high, если сливать контуры
- low, если оставить email отдельным

### Architecture generation mismatch

Old approach:

- Почти вся запись в `src/db/queries/*`, включая транзакции и события.

New approach:

- `src/db/operations/author-auth.ts`, `src/db/operations/author-media-items.ts`, `src/db/operations/demo-profile-import.ts`.

Files using old approach:

- `friends.ts`, `franchises.ts`, `quizzes.ts`, `media-items.ts`, `bug-reports.ts` и остальные query-файлы с `insert`/`update`.

Files using new approach:

- Только три файла operations.

Evidence that the newer approach is preferred:

- Слабое. Operations появились для сценариев с lock/limit (приватный лимит, demo import, сессия), но каталог мутаций туда не переехал. Предпочтение «всё в operations» кодом не подтверждено.

Migration candidate:

- Не массово переносить queries в operations. Это смена папки без смены поведения.
- Новые транзакции с несколькими агрегатами можно класть рядом с тем модулем, который уже держит этот сценарий.

Risk:

- high у большого переноса, польза в основном навигационная

### Architecture generation mismatch

Old approach:

- Агрегат оценок считается из `ratings` в запросах профиля.

New approach:

- Денормализация `media_item_rating_stats` и trigger в `drizzle/0079_media_item_rating_stats.sql`, плюс job `media.rating-stats-reconcile` (seed `enabled=true`, cron `0 1 * * *`).

Files using old approach:

- Профильные агрегаты в `src/db/queries/ratings.ts` и `src/db/queries/friends.ts` всё ещё считают по `ratings` (распределения автора, не карточка записи).

Files using new approach:

- Карточка/каталог через stats-таблицу и `src/db/queries/media-item-rating-stats.ts`.

Evidence that the newer approach is preferred:

- Миграция сама проверяет backfill (`RAISE EXCEPTION`, если counts расходятся) и заводит ночную сверку. Это осознанный кэш, не забытая колонка.

Migration candidate:

- Не удалять reconcile job. Он как раз страховка trigger.
- Не переписывать профильные распределения на stats: stats — на запись, профиль — на автора. Это разные срезы.

Risk:

- high, если убрать сверку «потому что есть trigger»

## Data layer

Таблицы в `src/db/schema.ts` покрывают архив, авторов, auth, email, jobs, domain events, уведомления, ачивки, AI, викторины, редакцию, activity log, багрепорты. Отдельных таблиц без соответствующего query-модуля в этом проходе не найдено. Удалять таблицы по аудиту кода нельзя: production usage не смотрелся.

Снято миграцией и в текущей схеме отсутствует:

- `email_automation_jobs`, колонки `delivery_interval_seconds` / `cleanup_interval_seconds` (`drizzle/0055_remove_legacy_email_automation.sql`).

Двойное хранение, которое выглядит намеренным:

- `ratings` и `media_item_rating_stats` (trigger + nightly reconcile).
- `media_item_metadata.facts` — кэш провайдера; `media_items.metadata_attempted_at` / `metadata_issue_code` — состояние попытки.
- `media_item_editorial_summaries` — текст AI от фактов (`source_hash`, модель). Это производный текст, не дубль колонки description. Job sweep в seed выключен (`drizzle/0086_media_item_editorial_summaries.sql`, `enabled=false`). Живое включение — needs verification.

Ограничения:

- Оценки: unique `(media_item_id, author_id)` и check шага в БД, плюс `parseRatingScoreInput` в серверных actions. Demo import check не дублирует (см. duplication).
- Дружба: unique пары, порядок id, статусы `pending`/`accepted` в БД; `send`/`accept` в `friends.ts` дополнительно фильтруют переход.
- Публикация: enum статусов в БД, допустимые переходы — в `WHERE` запросов (`submitAuthorMediaItemForPublication` и аналоги в franchises). Отдельного FSM-constraint на граф переходов нет. Это application-level. Переносить в БД имело бы смысл только вместе с полным списком переходов; сейчас список размазан, такой constraint легко окажется неполным.

N+1:

- `getRelatedFranchiseSections` в `src/db/queries/media-items.ts`: цикл `for (const section of sectionSources)` с `await getOtherMediaItemsFromFranchises`. Число секций на карточке обычно небольшое. Это реальный лишний round-trip на секцию, не повод переписывать весь каталог.
- Claim jobs и notification outbox обновляют строки циклом внутри одной транзакции (`src/db/queries/jobs.ts`, `src/db/queries/notification-transport-outbox.ts`). Это последовательный claim, не классический N+1 чтений с страницы. Трогать ради микрооптимизации не стоит.

Индексы и «всегда null» колонки по production-статистике не проверялись. Needs verification, если появится `pg_stat` или выборка долей NULL.

`getMediaTypeOptions` — не лишняя колонка и не лишняя таблица, а alias. См. backlog.

## Background processing

Системы:

| Система | Где | Как запускается |
|---|---|---|
| Job queue | `jobs`, `job_runs` | `npm run jobs:scheduler`, `npm run jobs:worker` |
| Domain outbox | `domain_event_outbox` | fast-path job + cron `domain-events-recovery` (`drizzle/0060`, `* * * * *`, enabled в seed) |
| Email outbox | `email_outbox` | job `auth.email-outbox-delivery` |
| Telegram outbox | `notification_transport_outbox` | fast-path + job `notifications.transport-delivery` |
| Rating stats | trigger + job reconcile | cron раз в сутки |
| Achievement backfill | job без cron | админ / self-chain, `schedulable: false` |
| Editorial summary generate | job без cron | ad-hoc, unique index активных run в `drizzle/0086` |

Пересечений «два cron делают одно и то же» нет. Email и Telegram — разные транспорты. Domain dispatch и notification delivery — цепочка, не дубль.

Риски со сценарием:

1. Poison domain event. Consumer бросает на конкретном `eventId`. `recoverPendingDomainEvents` ловит ошибку, пишет `console.error` и идёт дальше. Строка остаётся pending. Каждую минуту recovery снова её берёт. Доставка остальных событий в batch продолжается. Нет потолка попыток и нет статуса failed у outbox.

2. Fast-path не совпадает с политикой handler. `enqueueDomainEventDispatch` ставит `maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS` (3). Handler говорит `defaultMaxAttempts: 5`. После трёх неудач job run становится failed, но outbox всё ещё подбирает cron. Итог — не потеря доставки, а лишние failed runs и расхождение чисел в админке jobs.

3. Fast-path enqueue глотается. `enqueueDomainEventDispatch` и `enqueueNotificationTransportDelivery` при ошибке `createJobRun` только логируют. Доставка остаётся на cron `* * * * *`. Сценарий: insert job_runs упал после commit события → задержка до минуты, если cron job enabled. Если recovery job в БД выключен, задержка становится потерей доставки. Needs verification `jobs.enabled` для `domain-events-recovery` и transport delivery.

4. Email jobs в seed выключены. `drizzle/0054_jobs_email_seed.sql`: оба auth job `enabled=false`. Если в production их не включили вручную, `email_outbox` копится, письма не уходят. Needs verification. Код доставки при этом живой.

5. Editorial sweep в seed выключен (`enabled=false` в `drizzle/0086`). Ручная генерация справки через `media.editorial-summary-generate` от этого не зависит. Ночной обход сам не стартует, пока строку не включат.

6. Telegram duplicate. См. hotspot. Конкретный сценарий: `send` успешен, процесс умер до `complete`, lease истёк, второй worker отправил то же сообщение. Idempotency key в коде нет.

7. Обложки автора. Постановка thumbnail job в `src/app/author/(protected)/media/actions.ts` при ошибке enqueue логируется и не валит сохранение записи. Ночной `media.cover-thumbnails-backfill` может добрать. Это запасной путь, не второй scheduler. Needs verification, что backfill job в БД enabled.

8. Конкурентность worker. Claim — `FOR UPDATE SKIP LOCKED` по одному run на итерацию процесса. Несколько реплик делят очередь. Внутри процесса claim и recovery крутятся параллельно. Для Telegram это усиливает сценарий 6. Число реплик в этом репозитории не фиксировалось. Needs verification.

9. `friend.accepted` не создаёт второй handler. Dispatch помечает событие доставленным без side effect. Это не падающий job.

Отдельного outbox-процесса вне `job_runs` нет. Зарегистрированных типов без handler не найдено: все 12 типов из `jobHandlerRegistry` имеют `execute`.

## External integrations

| Интеграция | Модуль | Timeout / retry в коде | Секрет |
|---|---|---|---|
| TMDB, RAWG, Jikan, AniList, Comic Vine, FantLab, Open Library, Google Books, IGDB token | `src/lib/covers/providers/*` через `shared.ts` | нет AbortSignal; `fetchSearchJson` бросает `ProviderHttpError`; `fetchJson` на `!ok` возвращает `null` | ключи провайдеров шифруются `src/lib/covers/credential-crypto.ts`; у публичных API ключа может не быть |
| Roblox | `src/lib/covers/providers/roblox.ts` | 8s, читает `retry-after` | публичный API |
| OpenRouter, DeepSeek | `src/lib/ai/providers/*` | `runAiWithTimeout`, default 30s в service | `src/lib/ai/credential-crypto.ts` |
| Resend | `src/lib/auth/resend.ts` | 10s, retryable на 429/5xx | `src/lib/auth/email-provider-crypto.ts` |
| Telegram | `src/lib/notifications/transports/telegram-api.ts` | 10s, retry через outbox до 10 попыток | `src/lib/notifications/transports/credential-crypto.ts` |
| Turnstile | `src/lib/auth/turnstile-verification.ts` | 5s | env, не БД |
| MinIO | `src/lib/services/minio.ts` | явного timeout в просмотренном клиенте нет | env |
| Redis | `src/lib/services/redis.ts` | ошибка коннекта → `null` + `console.error` | env |
| Google Analytics | `src/lib/analytics/google-analytics.ts` | нет серверного HTTP | measurement id |

Vendor-коды (`tmdb`, `igdb`, …) сохраняются в `provider_settings` и в `media_items.cover_source_provider` / metadata source. Это привязка записи к источнику обложки, не бизнес-правило «рейтинг считается как у TMDB». Выносить коды из строки записи не предлагается: по ним потом обновляют метаданные.

Неиспользуемых клиентов в `src/lib/covers/providers` по факту импортов из registry не искались построчно для каждого файла сверх списка выше. FantLab/Google Books/Open Library вызывают `fetchJson` для details — этот путь молча теряет HTTP-ошибку. Needs verification, отличает ли UI «нет метаданных» от сбоя сети; по коду `fetchJson` оба случая способны дать `null`.

Старых версий API отдельным флагом в коде нет. `DEPRECATED_MODEL_IDS` у DeepSeek — актуальный фильтр, не старый адаптер на удаление.

Память провайдера в domain: коды вендоров в колонках media item. Это уже модель данных. Менять её ради «чистого домена» не окупается.

## Error handling / observability

Что уже сделано:

- `sanitizeJobError` в `src/lib/jobs/model.ts` вырезает `Bearer …`.
- `outbox-policy.ts` вырезает `bot<id>:<token>` из `last_error`.
- Поиск `console.*` рядом с token/secret/password/apiKey по `src/` совпадений не дал.
- Worker/scheduler логируют сбой итерации и не падают процессом (`src/jobs/worker.ts`).

Где ошибка становится тихой или теряет контекст:

- Turnstile: `catch { return { ok: false, reason: "unavailable" } }` без log (`src/lib/auth/turnstile-verification.ts`). Сценарий: Cloudflare недоступен, пользователь видит отказ проверки, в логах процесса причины нет. Для auth это мешает отличить «нет ключа» от «таймаут».
- `fetchJson`: HTTP error → `null`. Сценарий: Comic Vine/RAWG/Jikan details вернули 429, форма показывает пустые метаданные.
- Resend/Telegram: ошибка уходит в `last_error` outbox, не в `console`. Это нормально, если смотреть очередь в админке. Если админку не открывают, сбой виден только как растущий pending/failed. Отдельных metrics в коде нет.
- Domain recovery: лог есть, метки failed нет (см. hotspot).
- Redis down: `console.error` и `null`. Rate limit при недоступности Redis возвращает отказ (`ok: false, unavailable` в rate-limit слое) — это fail-closed для лимитов, не тихий bypass. Поведение конкретных call sites при `null` клиенте стоит проверять точечно при изменении rate limit. Needs verification для каждого call site, в этом аудите не разворачивалось.

Partial state:

- Domain event пишется в той же транзакции, что и агрегат (`runInDomainEventTransaction`). Откат агрегата откатывает событие.
- Fast-path job создаётся после commit. Его потеря не оставляет полузаписанный агрегат, только задержку доставки.
- Demo import — одна транзакция на весь профиль. Невалидный score или другой check откатывает и успешные строки этого импорта.
- Thumbnail enqueue после сохранения записи может не встать в очередь (catch + log). Запись уже сохранена, миниатюры может не быть до backfill.

Дублирующего логирования одного и того же сбоя парой info+error в горячем пути не выделялось, кроме rating stats reconcile: handler пишет `console.info` с результатом batch (`src/lib/jobs/handlers.ts`). Это не ошибка.

## Tests

Тесты — `node:test` в `tests/*.test.ts`, без skip.

Полезный сигнал: часть тестов читает исходники через `readFileSync` и матчит строки (например `tests/quizzes.test.ts` проверяет, что admin form содержит date picker; `tests/notifications.test.ts` — что consumer не содержит `fetch(` / Telegram; `tests/email-automation.test.ts` — что compose не содержит старый worker). Это фиксирует архитектурные запреты, которые runtime-тест не поймает. Минус: переименование символа или перенос JSX ломает тест без смены поведения.

Конкретные дыры, не «мало coverage»:

- `friend.accepted` пишется в `friends.ts`. Тесты друзей (`tests/friends-system.test.ts`) не обязаны падать, если событие перестанут читать: consumer его и так не читает. Риск: регрессия «приняли заявку, ачивка/уведомление не пришли» сейчас не может пойматься, потому что эффекта нет. Если эффект добавят, нужен тест на consumer, а не на строку в файле.
- `importDemoProfile` не проверяет лестницу score. Тест на «битый score в local profile не валит остальные оценки» в просмотренных контрактах не найден. Риск описан в duplication.
- Cover `fetchJson` без timeout не защищён тестом на зависание. `tests/cover-resilience-contracts.test.ts` существует; он не заменяет проверку AbortSignal, если в нём нет этого утверждения. Needs verification содержимого этого файла перед тем, как писать новый тест: возможно, контракт уже требует иное поведение.
- Включённость seed jobs (`enabled=false` для email и editorial sweep) тестами исходников не доказывается для живой БД.

Области со сложной логикой, где тесты есть и это не дыра: domain events/achievements (`tests/domain-events-achievements.test.ts`), quizzes model, metadata jobs, notification transports, author auth contracts. Предлагать «поднять coverage» отдельно не стоит.

## Dependencies

`package.json` dependencies, проверенные поиском импортов:

- Используются: `drizzle-orm`, `postgres`, `next`, `react`, `redis`, `sharp`, `cron-parser`, `lucide-react`, `@dnd-kit/*` (редактор документов), `@next/third-parties` (analytics consent), `react-easy-crop`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- `moment` + `moment/locale/ru` — только `src/lib/authors/experience-date.ts` (форматы year / `MMMM YYYY` / `D MMMM YYYY` и разбор ISO). Это не мёртвая зависимость. Убрать её можно только заменив эти форматы на `Intl` в том же модуле. Польза — минус одна runtime-библиотека. Риск — локаль месяца (`MMMM`) разъедется с текущим russian moment locale.
- `papaparse` и `@types/papaparse` — `tools/import-games-csv.ts` и скрипт `db:generate-games-import`. Это CLI импорта, не legacy UI. Оставлять в devDependencies было бы точнее, если инструмент не нужен в production image. Needs verification, попадает ли `tools/` в runtime image. Сейчас пакет в `devDependencies` — уже так.
- Второго HTTP-клиента (axios и т.п.) нет: везде `fetch`.
- Zod нет. Тащить его «для единообразия» этот аудит не предлагает: парсеры уже возвращают `{ ok, value }` / `null`.

Совместимых пакетов «ради старого React» не видно.

## Backlog

### A. Safe cleanup

ID: TECH-DEBT-001

Title: Удалить неиспользуемые парсеры page size архива

Category: A

Files: `src/lib/archive/tile-grid-capacity.ts`, `tests/archive-tile-grid-capacity.test.ts`

Problem: `clampArchiveListPageSize` нигде не вызывается. `parseArchiveListPageSize` / `parseArchiveCatalogPageSize` живут только для теста.

Evidence: поиск символов по репозиторию; production использует `getArchiveListPageSize` и `getArchiveCatalogPageSize`.

Why it matters: мёртвые функции рядом с живым расчётом сетки путают, какой page size реально уходит в запрос.

Suggested action: удалить три функции и утверждения теста, которые их вызывают. Живые `getArchive*` не трогать.

Verification before change: повторный `rg` по именам, включая `tools/`.

Regression risks: нет, если не задеть `getArchiveCatalogPageSize`.

Expected benefit: меньше ложного API у сетки архива.

Scope: XS

Confidence: high

ID: TECH-DEBT-002

Title: Удалить пустые каталоги снятых route

Category: A

Files: `src/app/api/internal/auth-cleanup/`, `src/app/api/internal/auth-email-outbox/`, `src/app/api/admin/media/suggest-franchises/`

Problem: каталоги без `route.ts` выглядят как живые endpoint.

Evidence: пустые директории; тесты запрещают старый email worker; suggest-franchises обслуживает другой path.

Why it matters: следующий человек может «починить» internal cron, который уже заменён jobs.

Suggested action: удалить пустые каталоги. Не добавлять route.

Verification before change: `find` этих путей; поиск URL `/api/internal/auth` в репо и в deploy-конфиге вне репо.

Regression risks: внешний cron на старый URL начнёт получать 404 вместо «и так 404». Поведение приложения не меняется.

Expected benefit: карта API совпадает с файлами.

Scope: XS

Confidence: high для репозитория, medium для внешнего cron

ID: TECH-DEBT-003

Title: Убрать повторный spread timestamps у mediaItems

Category: A

Files: `src/db/schema.ts`

Problem: первый `...timestamps()` затирается вторым в том же объекте.

Evidence: функция `timestamps()` и два spread в `mediaItems`.

Why it matters: при чтении схемы кажется, что колонки заданы дважды или что между ними был смысл.

Suggested action: оставить один spread там, где он соответствует колонкам `created_at` / `updated_at`. Не генерировать миграцию, если snapshot колонок не меняется.

Verification before change: diff drizzle schema snapshot пустой по `media_items`.

Regression risks: случайно сгенерированная миграция drop/add timestamp. Её не применять.

Expected benefit: схема читается буквально.

Scope: XS

Confidence: high

### B. Removal candidates

ID: TECH-DEBT-004

Title: Решить судьбу события friend.accepted

Category: B

Files: `src/db/queries/friends.ts`, `src/lib/domain-events/catalog.ts`, `src/lib/achievements/consumer.ts`, `src/lib/notifications/consumer.ts`

Problem: событие пишется и помечается доставленным, consumers его не обрабатывают.

Evidence: тип есть в `DOMAIN_EVENT_TYPES` и в `appendEvent`; его нет в `eventTypes` обоих consumers; в `src/lib/achievements` нет правил про друзей.

Why it matters: либо это забытый side effect (принятие в друзья ничего не запускает), либо задел, который все считают работающим.

Suggested action: продуктово подтвердить, нужен ли эффект. Если нет — перестать писать событие. Если да — добавить consumer. Не удалять исторические строки `domain_events`.

Verification before change: нет ли внешнего отчёта по `domain_events.type = 'friend.accepted'`.

Regression risks: удаление записи события ломает будущий backfill, если он рассчитывает на историю.

Expected benefit: либо появляется реальный эффект, либо исчезает ложная точка расширения.

Scope: S

Confidence: medium

ID: TECH-DEBT-005

Title: Проверить неиспользуемый auth method telegram

Category: B

Files: `src/lib/auth/author-account-model.ts`, `src/db/schema.ts`

Problem: значение разрешено check-ом и типом, код сессию с ним не создаёт.

Evidence: нет `authMethod: "telegram"` в `src/`. Telegram — транспорт уведомлений.

Why it matters: новый логин легко повесить не на тот контур и перепутать с bot token.

Suggested action: не менять схему, пока SQL не покажет отсутствие строк. Если строк нет и логин не планируется — отдельная миграция сужения check.

Verification before change: группировка `auth_method` в сессиях и identities.

Regression risks: снятие значения уронит существующие строки.

Expected benefit: тип метода совпадает с реальными входами.

Scope: S, плюс миграция

Confidence: high что логина нет, low что схему уже можно сузить

### C. Small refactoring

ID: TECH-DEBT-006

Title: Проверять demo-оценку тем же правилом, что сервер

Category: C

Files: `src/app/author-rating-form.tsx`, `src/lib/ratings/score.ts`, `src/db/operations/demo-profile-import.ts`

Problem: demo считает score умножением, импорт вставляет его без `parseRatingScoreInput`. Один битый score откатывает весь импорт из-за check БД.

Evidence: ветка `isDemo` в форме; `ratingRows` в `importDemoProfile`; check на `ratings.score` описан в схеме/миграциях оценок.

Why it matters: импорт — мост из локальной истории в аккаунт. Частичный мусор в localStorage не должен отменять остальные оценки.

Suggested action: отбрасывать score, не проходящий ту же проверку, что `parseRatingScoreInput`, и считать такие строки skipped. Не ослаблять check в БД.

Verification before change: тест импорта с одним невалидным score и одним валидным.

Regression risks: слишком строгий фильтр отбросит легитимные 10…100 с шагом 10, если predicate скопировать с ошибкой.

Expected benefit: импорт не падает целиком.

Scope: S

Confidence: high

ID: TECH-DEBT-007

Title: Общий timeout для cover fetch

Category: C

Files: `src/lib/covers/providers/shared.ts`, провайдеры, которые его вызывают

Problem: `fetch` без отмены. `fetchJson` прячет HTTP-ошибку.

Evidence: `shared.ts` не содержит AbortSignal; Roblox, AI, Resend, Telegram, Turnstile — содержат.

Why it matters: форма записи и metadata jobs ждут внешний каталог без собственного предела.

Suggested action: timeout в двух функциях shared. Для `fetchJson` хотя бы логировать статус, не меняя контракт `null`, если вызывающие на `null` завязаны. Search-путь уже бросает `ProviderHttpError`.

Verification before change: прогнать cover contract tests; ручной поиск обложки с заведомо медленным URL в dev.

Regression risks: ложные пустые выдачи при коротком timeout.

Expected benefit: зависший вендор не держит server action неопределённо долго.

Scope: S

Confidence: high

ID: TECH-DEBT-008

Title: Потолок попыток у domain event outbox

Category: C

Files: `src/lib/domain-events/dispatcher.ts`, `src/lib/domain-events/queue.ts`, при необходимости схема `domain_event_outbox`

Problem: poison event ретраится без лимита; fast-path ставит 3 попытки, handler объявляет 5.

Evidence: catch в `recoverPendingDomainEvents`; константы в `queue.ts` и `handlers.ts`.

Why it matters: застрявшее событие шумит каждую минуту и не видно как failed.

Suggested action: колонка попыток или эквивалент в outbox, после лимита не брать строку в recovery, сохранить `last_error`. Fast-path собрать из policy handler-а. Cron recovery оставить.

Verification before change: тест «consumer бросает → после N recovery строка не выбирается, соседнее событие доставляется».

Regression risks: слишком маленький лимит оставит событие недоставленным при коротком сбое.

Expected benefit: предсказуемый отказ вместо вечного retry.

Scope: M

Confidence: high

ID: TECH-DEBT-009

Title: Логировать отказ Turnstile

Category: C

Files: `src/lib/auth/turnstile-verification.ts`

Problem: сеть и битый JSON превращаются в `unavailable` без записи в лог.

Evidence: пустой `catch` и catch вокруг `response.json()`.

Why it matters: логин/регистрация начинают отказывать, и по логам процесса причина не видна. Секрет в этот catch не логируется, если писать только `reason` и статус.

Suggested action: `console.error` с reason, без токена и secret.

Verification before change: unit с fetcher, который бросает, и проверка что в сообщении нет token.

Regression risks: случайно залогировать token. Не логировать тело ответа целиком.

Expected benefit: сбой Cloudflare отличим от «ключ не задан».

Scope: XS

Confidence: high

ID: TECH-DEBT-010

Title: Общий parsePage на странице ачивок админки

Category: C

Files: `src/app/admin/(protected)/achievements/page.tsx`, `src/lib/common/pagination.ts`

Problem: локальная копия `parsePage`.

Evidence: функция на строке 25 страницы совпадает с `src/lib/common/pagination.ts`.

Why it matters: мелочь, но это единственный явный форк уже существующего helper.

Suggested action: импортировать общий `parsePage`. Локальные parseStatus/visibility не трогать.

Verification before change: страница админки ачивок с `page=0`, пустым и `page=2`.

Regression risks: нет, формулы одинаковые.

Expected benefit: один парсер страницы.

Scope: XS

Confidence: high

### D. Structural refactoring

ID: TECH-DEBT-011

Title: Собрать переходы публикации записи и серии в одном месте внутри текущего слоя

Category: D

Files: `src/db/queries/media-items.ts`, `src/db/queries/franchises.ts`, соответствующие `actions.ts`

Problem: submit/review/withdraw и `appendEvent` перемешаны с каталожными SELECT.

Evidence: списки export в обоих query-файлах; `src/db/operations` эти переходы не содержит.

Why it matters: следующее изменение модерации требует правок в самых больших data-модулях и легко цепляет публичный каталог.

Suggested action: перенести только функции смены статуса (без смены SQL и без нового фреймворка) в соседние модули, которые queries реэкспортируют, чтобы call sites не переписывать пачкой. Каталожные SELECT оставить.

Verification before change: существующие тесты модерации (`tests/media-item-franchise-moderation.test.ts` и соседние) до и после.

Regression risks: циклический import между новым модулем и queries. Реэкспорт должен идти в одну сторону.

Expected benefit: дифф модерации больше не содержит каталожный SQL.

Scope: L

Confidence: medium

Не предлагается как задача: переименовать `queries` в `repositories`, ввести use-case на каждую action, перенести email в domain events, разрезать `media-rating-panel.tsx`.

### E. Data/schema cleanup

ID: TECH-DEBT-012

Title: Сузить auth_method, если telegram-строк нет

Category: E

Files: `src/db/schema.ts`, миграция, `src/lib/auth/author-account-model.ts`

Problem: check шире реального кода.

Evidence: см. TECH-DEBT-005.

Why it matters: схема обещает третий способ входа.

Suggested action: только после production-выборки. Отдельная миграция, не вместе с чисткой кода.

Verification before change: counts по `auth_method`.

Regression risks: миграция падает или ломает старые сессии.

Expected benefit: меньше ложных веток в auth.

Scope: S

Confidence: low до SQL

ID: TECH-DEBT-013

Title: Не удалять rating stats reconcile

Category: E

Files: `drizzle/0079_media_item_rating_stats.sql`, `src/db/queries/media-item-rating-stats.ts`, handler `media.rating-stats-reconcile`

Problem: выглядит как дубль trigger, но это сверка денормализации.

Evidence: seed job enabled, trigger синхронизирует stats, job описан как reconciliation.

Why it matters: удаление «лишней» таблицы или job уберёт защиту от рассинхрона.

Suggested action: не удалять. Если stats когда-нибудь разойдутся, смотреть failed runs этого job.

Verification before change: не требуется, пока нет плана удаления.

Regression risks: удаление job оставляет тихий drift, если trigger обойдут сырым SQL.

Expected benefit: фиксация решения «оставить».

Scope: XS (решение, не код)

Confidence: high

### F. Needs investigation

ID: TECH-DEBT-014

Title: Живые флаги jobs.enabled для email, editorial sweep, domain recovery, thumbnail backfill

Category: F

Files: seed `drizzle/0054_jobs_email_seed.sql`, `drizzle/0086_media_item_editorial_summaries.sql`, `drizzle/0060_domain_events_achievements.sql`, админка jobs

Problem: seed задаёт `enabled=false` для email и editorial sweep и `true` для recovery. `ON CONFLICT DO NOTHING` не описывает текущую БД.

Evidence: SQL seed. Runtime handler-ы существуют независимо от флага.

Why it matters: выключенный email job означает тихую очередь писем. Выключенный recovery при падении fast-path означает недоставленные события.

Suggested action: в админке или SQL посмотреть `jobs` по `code`. Не менять флаги из этого аудита.

Verification before change: сам запрос и есть проверка.

Regression risks: включить тяжёлый editorial sweep без лимита стоимости AI.

Expected benefit: понятно, какие фоновые контуры реально работают.

Scope: XS

Confidence: high что seed ≠ prod, low что именно сломано

ID: TECH-DEBT-015

Title: Число реплик jobs-worker и дубли Telegram

Category: F

Files: `src/lib/notifications/outbox-policy.ts`, `src/db/queries/notification-transport-outbox.ts`, deploy compose

Problem: повторная отставка после успешного send до complete. Несколько worker усиливают гонку.

Evidence: порядок send → complete; lease reclaim для `sending`; idempotency key отсутствует.

Why it matters: модерационный чат может получить дубль.

Suggested action: посчитать реплики. Если реплика одна, риск остаётся на crash между send и complete. Решение по idempotency — отдельно, после проверки Bot API.

Verification before change: логи worker и повторные `delivered` на один `(event_id, recipient)`.

Regression risks: правка доставки без теста lease.

Expected benefit: подтверждённый или снятый инцидент, а не догадка.

Scope: S на расследование

Confidence: medium

### G. Do not touch yet

ID: TECH-DEBT-016

Title: Carrier-specific rating panel

Category: G

Files: `src/app/media-rating-panel.tsx`, `src/lib/ratings/tone.ts`

Problem: файл большой из-за вариантов носителей.

Evidence: импорты `AVERAGE_*` / `AUTHOR_*` tone maps на каждый carrier.

Why it matters: визуальная матрица — продуктовое требование носителей, не случайный рост.

Suggested action: не дробить, пока не меняется сам набор носителей.

Verification before change: не требуется.

Regression risks: разъезд hover/rating стилей между носителями.

Expected benefit: нет, пока нет конкретной поломки.

Scope: L если всё же резать

Confidence: high что резать рано

ID: TECH-DEBT-017

Title: Слияние email outbox и domain events

Category: G

Files: `src/lib/auth/email-outbox-delivery.ts`, `src/lib/domain-events/*`

Problem: два механизма доставки выглядят как поколения.

Evidence: email старше (`drizzle/0034` / `0054`), события с `drizzle/0060`. У email свой crypto payload и Resend idempotency key.

Why it matters: объединение смешает секреты писем с продуктовыми событиями и не уберёт ни одного бага из этого аудита.

Suggested action: оставить два контура.

Verification before change: не требуется.

Regression risks: письмо с challenge попадёт в notification payload.

Expected benefit: нет практического.

Scope: L

Confidence: high

ID: TECH-DEBT-018

Title: Массовый перенос queries в operations

Category: G

Files: `src/db/queries/*`, `src/db/operations/*`

Problem: слой operations не стал стандартом.

Evidence: три файла operations против десятков пишущих queries.

Why it matters: перенос без смены границ модерации — переименование. Реальная боль закрывается точечно (TECH-DEBT-011), не новым слоем на всё приложение.

Suggested action: не начинать миграцию слоя.

Verification before change: не требуется.

Regression risks: циклические импорты и сломанные тесты путей.

Expected benefit: навигация, не поведение.

Scope: XL

Confidence: high

ID: TECH-DEBT-019

Title: Замена moment и слияние AI-клиентов

Category: G

Files: `src/lib/authors/experience-date.ts`, `src/lib/ai/providers/deepseek.ts`, `src/lib/ai/providers/openrouter.ts`

Problem: одна библиотека дат и два похожих chat-completions клиента.

Evidence: moment импортируется в одном файле; у провайдеров разные base URL, модели и классификация ошибок; общий timeout уже есть.

Why it matters: выигрыш — размер зависимостей и меньше копипасты ошибок. Цена — регрессия локали дат и тонких кодов AI.

Suggested action: делать только вместе с правкой дат опыта или с добавлением третьего AI-провайдера.

Verification before change: `tests/experience-date.test.ts`, `tests/deepseek-provider.test.ts`.

Regression risks: другой текст месяца; сломанный разбор ошибки провайдера.

Expected benefit: заметна только в момент касания этих файлов.

Scope: S каждый

Confidence: medium

ID: TECH-DEBT-020

Title: Свёртка scoreDistribution и литералы published

Category: G

Files: `src/db/queries/ratings.ts`, `src/db/queries/friends.ts`, `src/db/operations/demo-profile-import.ts`

Problem: одинаковая свёртка Map и строка `"published"` рядом с константой.

Evidence: см. раздел Duplication.

Why it matters: расхождение возможно, но сейчас значения и формулы совпадают. Отдельный PR ничего не чинит в проде.

Suggested action: поправить попутно.

Verification before change: не требуется отдельно.

Regression risks: низкие, но и польза низкая.

Expected benefit: чуть проще поиск.

Scope: XS

Confidence: high

## Good first cleanup candidates

- TECH-DEBT-001 — неиспользуемые парсеры page size. Доказано поиском, риск низкий.
- TECH-DEBT-002 — пустые каталоги route. Не меняют поведение Next.js.
- TECH-DEBT-003 — двойной `timestamps()`. Проверить, что миграция не генерируется.
- TECH-DEBT-009 — лог Turnstile без секретов. Маленький и локальный.
- TECH-DEBT-010 — общий `parsePage` на странице ачивок.
- TECH-DEBT-006 — проверка score на импорте demo. Чуть шире, но сценарий сбоя конкретный: одна битая оценка откатывает весь импорт.

## Worth doing when touching this area

- TECH-DEBT-007 — timeout cover providers, когда правят поиск обложек или metadata jobs.
- TECH-DEBT-008 — лимит poison events, когда правят dispatcher или жалуются на шум recovery.
- TECH-DEBT-004 — `friend.accepted`, когда трогают друзей или ачивки.
- TECH-DEBT-011 — вынести переходы публикации, когда снова меняется модерация серии или записи.
- TECH-DEBT-014 и TECH-DEBT-015 — флаги jobs и дубли Telegram, когда разбирают прод-инцидент доставки.
- TECH-DEBT-019 — moment и AI-клиенты только вместе с этими модулями.
- TECH-DEBT-020 — литералы `published` и fold распределений попутно.
- Совместимость URL (`next.config.ts` redirects, `?review=`, author onboarding/settings redirects, alias `getMediaTypeOptions`) снимать только с планом внешних ссылок, не как cleanup.

## Major refactor requiring separate project

- TECH-DEBT-011, если делать не точечный перенос статусов, а раскладку всех `franchises.ts` / `media-items.ts` по слоям. Имеет смысл только как часть конкретной смены правил модерации.
- Отдельный проект «единый outbox на email + события + Telegram» не рекомендуется (TECH-DEBT-017). Если когда-нибудь появится третий внешний транспорт с теми же требованиями, чем у Telegram, расширять `notification_transport_outbox`, а не переносить туда почту.

## Needs investigation

- TECH-DEBT-014 — фактические `jobs.enabled`.
- TECH-DEBT-015 — реплики worker и повторы Telegram.
- TECH-DEBT-005 / TECH-DEBT-012 — есть ли в БД `auth_method = telegram`.
- Внешние вызовы `/api/internal/auth-*`, если логи балансировщика доступны.
- Доля застрявших `domain_event_outbox.dispatched_at is null` старше одного интервала cron.
- Включён ли в проде editorial sweep и backfill обложек. Код seed это не доказывает.

## Do not touch yet

- TECH-DEBT-016 — rating panel носителей.
- TECH-DEBT-017 — слияние email и domain events.
- TECH-DEBT-018 — повальный перенос в `operations`.
- TECH-DEBT-013 — не удалять reconcile stats.
- Access-token вход, DeepSeek `DEPRECATED_MODEL_IDS`, fallback старых activity log payload, редиректы franchises/reviews.
- Денормализация `media_item_rating_stats` и кэш `media_item_metadata`.

## Self-review notes

Попытка опровергнуть removal с confidence high:

- `clampArchiveListPageSize` / `parseArchive*`. Обратное использование: dynamic import, job, admin, тест. Поиск по имени нашёл только определение и один тест на `parseArchiveCatalogPageSize`. Скрытый вызов по строке имени не найден. Confidence high оставлен. Польза маленькая, это не «удалить модуль».
- Пустые API-каталоги. Обратное: файл `route.ts` мог быть проигнорирован. `find` показал каталоги пустыми. Внешний cron возможен, поэтому risk для внешнего мира medium, для кода приложения low.
- Двойной `timestamps()`. Обратное: второй spread мог добавлять другие поля. Функция возвращает только `createdAt` и `updatedAt`, второй spread их заменяет. Колонки в БД не дублируются. Удаление первого spread не чистит данные.

`friend.accepted` сначала выглядел как dead code. Опровержение: строки в `domain_events` — история, тип часть публичного каталога событий, consumer можно добавить без миграции продюсера. Поэтому это не high-confidence removal. Оставлено как medium и вынесено из safe cleanup.

`getMediaTypeOptions` помечен deprecated, но импортируется админкой и типами форм. Удаление alias — не удаление поведения. В removal candidates не включён.

Structural refactor «разнести queries»: выигрыш не в эстетике, а в том, что дифф модерации не тащит каталожный SQL. Если ограничиться переименованием папок, выигрыша нет — этот вариант записан в Do not touch (TECH-DEBT-018). Узкий перенос статусов оставлен с confidence medium.

Слияние AI-клиентов и отказ от moment не прошли проверку «что кроме эстетики»: поведение дат и коды ошибок провайдеров разные, общий timeout у AI уже есть. Отдельной задачей не стоят.

Reconcile rating stats не является мёртвым дублем trigger: job включён в seed как сверка. Предложение удалить его снято.

N+1 секций франшиз оставлен в тексте data layer и не поднят в первый backlog: число секций на карточке ограничено деревом, выигрыш не доказан замером. Чинить при медленной карточке записи, не заранее.
