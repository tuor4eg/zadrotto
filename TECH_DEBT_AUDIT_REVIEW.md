# Technical Debt Audit — Independent Review

Ревью `TECH_DEBT_AUDIT.md`. Каждый вывод перепроверен по коду текущего working tree. Production-БД, логи и deploy-окружение недоступны: всё, что зависит от живых данных, вынесено в `Production verification checklist`, а не утверждается.

## Executive verdict

Первый аудит аккуратен в формулировках и правильно отказывается от крупных рефакторингов (TECH-DEBT-016…019). Главная проблема другая: он потратил внимание на косметику и пропустил несколько вещей, которые реально влияют на безопасность и надёжность.

Что не так с первым аудитом:

1. **Пропущен authz-баг.** `deleteAchievementLevelAction` в `src/app/admin/(protected)/achievements/actions.ts` — единственная server action в проекте без проверки сессии (сканировал все 46 файлов с `"use server"`). Middleware/proxy в репозитории нет. Это самая важная находка ревью.
2. **Недооценён риск cover providers (TECH-DEBT-007).** Первый аудит описал его как «форма ждёт вендора». На деле опаснее фон: один `jobs-worker`, обработка по одной задаче, handlers metadata-джобов не передают `signal`, `fetch` без timeout. Зависший вендор задерживает всю очередь, включая письма подтверждения email и доставку domain events.
3. **Пропущен сценарий потери чужих данных.** Автор может удалить свою запись после того, как админ снял её с публикации. `deleteAuthorDraftMediaItem` удаляет оценки и опыт **всех** пользователей по записи, а не только автора.
4. **Две позиции — false positive.** TECH-DEBT-006 (demo score уже валидируется `parseDemoProfile`) и TECH-DEBT-002 (пустые каталоги не отслеживаются git, коммитить нечего).
5. **Неверное доказательство в TECH-DEBT-001.** Компоненты, на которые ссылается аудит как на production-потребителей `getArchive*PageSize`, сами нигде не импортируются.
6. **Poison events (TECH-DEBT-008) описаны неточно.** «Вечный retry» — не главный эффект. Главный — голодание recovery: он берёт 50 самых старых pending строк, и 50+ poison-событий полностью блокируют cron-recovery для всех новых событий. При этом в текущем коде реалистичный источник poison один — удаление типа из каталога. Consumers устойчивы к битой конфигурации.
7. **Неверные способы проверки.** Для TECH-DEBT-015 предложено искать повторные `delivered` строки на `(event_id, recipient)`, но у `notification_transport_outbox` PK `(event_id, transport, recipient)` — дубли в БД невозможны, они бывают только в Telegram. Для TECH-DEBT-005 предложено проверить «identities» — колонки `auth_method` там нет, она есть только в `author_sessions`.

Подтверждённых полезных задач немного:

| Приоритет | Задача |
|---|---|
| Fix now | `requireAdminUser()` в `deleteAchievementLevelAction` |
| Fix now | timeout в `shared.ts` + IGDB |
| Verify first → fix | ограничить `deleteAuthorDraftMediaItem` данными автора |
| Verify first | `jobs.enabled` + отставание очереди + pending outbox |
| Fix when touching | одна транзакция для submit записи и переноса серий |

Остальное — либо косметика, либо «оставить как есть».

## Review of existing backlog

### TECH-DEBT-001 — неиспользуемые парсеры page size архива

**Verdict:** PARTIALLY CONFIRMED / VALID BUT LOW VALUE

**Evidence:**
- `parseArchiveListPageSize`, `clampArchiveListPageSize`, `parseArchiveCatalogPageSize` в `src/lib/archive/tile-grid-capacity.ts` действительно вызываются только из теста.
- Утверждение «production берёт размер через `getArchiveListPageSize` (`archive-list-tile-grid.tsx`) и `getArchiveCatalogPageSize` (`adaptive-archive-page-size-sync.tsx`)» неверно. `ArchiveListTileGrid` и `AdaptiveArchivePageSizeSync` не импортируются ни одним файлом `src/`, `tools/`, `tests/`. Живые потребители модуля — только константы `ARCHIVE_LIST_TARGET_TILE_WIDTH` / `ARCHIVE_LIST_TILE_GAP` в `src/components/archive/responsive-tile-grid.tsx` и `src/app/main/random-franchise-section.tsx`.
- `src/app/archive/page.tsx` принимает только `CATALOG_PAGE_SIZE_OPTIONS = [24, 48, 72, 96]`. `AdaptiveArchivePageSizeSync` считает размеры по сетке (5 рядов × колонки: 15/20/30…).

**What the first audit got right:** три функции не вызываются в runtime.

**What the first audit missed:**
- Мёртвый кластер шире: два orphan-компонента и функции `getArchive*`.
- Hidden risk: если кто-то «оживит» `AdaptiveArchivePageSizeSync` как якобы используемый компонент, его размеры не совпадут с белым списком `parsePageSize`. Возможен цикл `router.replace`. Это аргумент не за срочное удаление, а против «починки» этого компонента.

**Recommendation:** remove from backlog как отдельную задачу. Если трогать архивную сетку — удалить кластер целиком (два компонента + неиспользуемые функции + тест), константы оставить.

### TECH-DEBT-002 — пустые каталоги снятых route

**Verdict:** FALSE POSITIVE

**Evidence:** `git ls-files src/app/api/internal/auth-cleanup src/app/api/internal/auth-email-outbox src/app/api/admin/media/suggest-franchises` пуст. Git не хранит пустые каталоги, в репозитории их нет. Это артефакт локальной копии, каталоги принадлежат `root` — видимо, остались от прежнего docker-монтирования.

**What the first audit got right:** маршрутов там нет. Возможный внешний cron на старые URL — правильный вопрос.

**What the first audit missed:** удалять нечего, PR будет пустым. Вопрос внешнего cron к этой задаче не относится: он проверяется по access-логам независимо (см. checklist).

**Recommendation:** remove from backlog. Локально — `sudo rmdir` по желанию.

### TECH-DEBT-003 — повторный `timestamps()` в `mediaItems`

**Verdict:** CONFIRMED / VALID BUT LOW VALUE

**Evidence:** два `...timestamps()` в объекте `mediaItems` в `src/db/schema.ts`. Второй перезаписывает те же ключи `createdAt` / `updatedAt`.

**What the first audit got right:** миграция не нужна; предупреждение не применять случайно сгенерированную.

**What the first audit missed:** ничего существенного. Польза нулевая для поведения.

**Recommendation:** do when touching this area.

### TECH-DEBT-004 — `friend.accepted` без consumer

**Verdict:** CONFIRMED (факт) / VALID BUT LOW VALUE (как задача)

**Evidence:**
- `acceptFriendRequest` (`src/db/queries/friends.ts:159-190`) пишет событие в `runInDomainEventTransaction`.
- В `src/lib/domain-events/registry.ts` два consumer-а, ни один не подписан на `friend.accepted`.
- `dispatchDomainEvent` помечает такое событие dispatched после пустого цикла.

**What the first audit got right:** не удалять историю и не считать это dead code. Сначала продуктовое решение.

**What the first audit missed:**
- Главный технический риск удаления. Если убрать `"friend.accepted"` из `DOMAIN_EVENT_TYPES`, все ещё не dispatched строки этого типа станут poison: `dispatchDomainEvent` бросает `Unsupported domain event type`.
- Recovery берёт 50 самых старых pending строк. Значит, poison в голове очереди вытесняет живые события (см. TECH-DEBT-008).
- Безопасный порядок удаления: сначала перестать писать событие → дождаться, пока pending этого типа станет 0 → только потом трогать каталог.
- Стоимость события нулевая: одна строка в двух таблицах на принятие дружбы.

**Recommendation:** leave alone. Если продукт решит убрать — только в описанном порядке.

### TECH-DEBT-005 — auth method `telegram`

**Verdict:** CONFIRMED (нет writer-а) / VALID BUT LOW VALUE

**Evidence:**
- `auth_method` есть только в `author_sessions` (`drizzle/0032_yielding_blockbuster.sql`, check `in ('password','access_token','telegram')`). Колонки в «identities» нет — этот пункт проверки у первого аудита невалиден.
- `rg 'authMethod: "telegram"'` в `src/` пуст.

**What the first audit got right:** не трогать схему без SQL.

**What the first audit missed:**
- Даже при 0 строк сужение check ничего не даёт: оно не защищает от бага и не упрощает код.
- Сессии короткоживущие. Старые строки чистит `auth-cleanup`, а он в seed выключен — возможно, их там много.
- Риск «новый логин повесят не туда» чисто гипотетический.

**Recommendation:** remove from backlog.

### TECH-DEBT-006 — валидация demo score на импорте

**Verdict:** FALSE POSITIVE

**Evidence:**
- `importDemoProfileAction` (`src/app/demo-profile/actions.ts`) вызывает `parseDemoProfile(rawProfile)` до импорта.
- В `src/lib/user-state/demo-profile.ts` `isScore` требует целое 10…100 с шагом 10. Невалидные записи отбрасываются, а не валят профиль. Даты опыта проверяются паттерном, статусы — whitelist.
- `readDemoProfile` парсит тем же кодом на клиенте.
- Форма (`src/app/author-rating-form.tsx`) формирует score из кнопок, а не из свободного ввода.

**What the first audit got right:** правильно поставленный вопрос о trust boundary.

**What the first audit missed:** существующую валидацию. Сценарий «один битый score откатывает весь импорт» по коду невозможен: битый score не доходит до `importDemoProfile`.

**Recommendation:** remove from backlog. Реальные мелкие расхождения demo import описаны в `Demo import verdict`.

### TECH-DEBT-007 — timeout cover providers

**Verdict:** VALID BUT MISPRIORITIZED (недооценён)

**Evidence:**
- `fetchJson` / `fetchSearchJson` в `src/lib/covers/providers/shared.ts` вызывают `fetch` без `signal`. IGDB делает собственный `fetch` (`src/lib/covers/providers/igdb.ts:103`), тоже без timeout.
- Node 22 (`Dockerfile`: `node:22-alpine`): дефолтные `headersTimeout` / `bodyTimeout` undici — 300 с на запрос.
- `registry.ts` ждёт провайдеров через `Promise.allSettled`, то есть самый медленный задаёт время ответа.
- `runMetadataBackfill` / `runMetadataRefresh` (`src/lib/media/metadata-jobs.ts`) идут по элементам последовательно, без дедлайна.
- Handlers `media.metadata-backfill` / `media.metadata-refresh` не передают `signal`. `executeClaimedJobRun` не делает `Promise.race` с abort: worker ждёт handler до конца, сколько бы тот ни шёл.
- Worker один (`docker-compose.yml`) и берёт одну задачу за раз.

**What the first audit got right:** место правки (`shared.ts`); `fetchJson` прячет HTTP-статус.

**What the first audit missed:**
- Фоновой сценарий важнее UI. Вендор принимает соединение и молчит → каждый элемент backfill (limit 25) ждёт до 300 с на запрос → job идёт часами.
- Все остальные задачи, включая `auth.email-outbox-delivery` (письма подтверждения и сброса пароля доставляются **только** этим cron) и fast-path domain events, стоят за ним в FIFO.
- После `timeout_seconds` recovery-цикл снимает lease и ставит run обратно. Когда handler всё-таки закончится, `finishJobRun` не пройдёт по lock token, и тот же run выполнится ещё раз.
- IGDB не входит в `shared.ts`, и правка только там его не закроет.

**Recommendation:** do now (минимальный API — в `Cover provider reliability verdict`).

### TECH-DEBT-008 — лимит попыток domain event outbox

**Verdict:** PARTIALLY CONFIRMED / VALID BUT MISPRIORITIZED

**Evidence:**
- `recoverPendingDomainEvents` (`src/lib/domain-events/dispatcher.ts`) выбирает 50 самых старых `dispatched_at is null` по `created_at` без учёта прошлых неудач. Ошибку по событию логирует и идёт дальше.
- Fast-path ставит `DEFAULT_JOB_MAX_ATTEMPTS` (3) вместо `defaultMaxAttempts: 5` handler-а.
- Consumer achievements устойчив к битой конфигурации: `parseParams` в `try/catch` в `src/lib/achievements/service.ts`. Неизвестная механика только логируется.

**What the first audit got right:** нет статуса failed и `last_error`; расхождение 3/5.

**What the first audit missed:**
- Реальный failure mode — не шум, а **голодание**. При ≥50 poison-строках recovery каждую минуту обрабатывает только их, а новые события доставляются лишь fast-path. Любой сбой fast-path (ошибка enqueue после commit логируется и глотается) становится фактической потерей доставки.
- Реалистичный источник poison в текущем коде один: тип, убранный из каталога. Отсюда связь с TECH-DEBT-004. Транзиентные ошибки БД poison не создают.
- Расхождение 3/5 не влияет на доставку: после failed fast-path событие добирает cron.
- Предложенный Scope M со схемой — дорогое решение для гипотетической проблемы.

**Recommendation:** investigate first (`Production check: domain event outbox backlog`). Если pending старше 5 минут = 0 — оставить. Если есть — минимальная правка: колонки `attempts` + `last_error` + `next_attempt_at` в `domain_event_outbox`, recovery выбирает `next_attempt_at <= now()` с backoff. Статус failed не обязателен. 3/5 выровнять попутно.

### TECH-DEBT-009 — логировать отказ Turnstile

**Verdict:** CONFIRMED / VALID BUT LOW VALUE

**Evidence:** `src/lib/auth/turnstile-verification.ts` возвращает `unavailable` без лога. Логин пишет `author.login.failed` в activity log без причины.

**What the first audit got right:** не логировать token и secret.

**What the first audit missed:** ничего. Польза — диагностика редкого сбоя Cloudflare.

**Recommendation:** do when touching this area.

### TECH-DEBT-010 — локальный `parsePage` на странице ачивок

**Verdict:** CONFIRMED / VALID BUT LOW VALUE

**Evidence:** `src/app/admin/(protected)/achievements/page.tsx:25` дублирует `src/lib/common/pagination.ts`.

**What the first audit got right:** всё.

**What the first audit missed:** не стоит отдельного PR.

**Recommendation:** do when touching this area. Страница ачивок всё равно будет затронута правкой authz-бага, можно заодно.

### TECH-DEBT-011 — переходы публикации записи и серии

**Verdict:** PARTIALLY CONFIRMED / VALID BUT MISPRIORITIZED

**Evidence:** см. `Media / franchise architecture verdict`.

**What the first audit got right:** не предлагать новый слой и массовый перенос в `operations`.

**What the first audit missed:**
- Предложенное действие (перенести функции статусов в соседние модули с реэкспортом) — переезд кода без изменения поведения. Именно этого просили не предлагать.
- Реальная связность другая: submit записи и перенос её серий — две транзакции в action; удаление автором задевает чужие данные.
- Scope L за навигационную пользу.

**Recommendation:** leave alone как структурный рефакторинг. Вместо него — две точечные задачи: удаление автором (Verify first) и одна транзакция submit + серии (Fix when touching).

### TECH-DEBT-012 — сузить `auth_method`

**Verdict:** VALID BUT LOW VALUE

**Evidence:** как TECH-DEBT-005. Миграция может упасть на старых строках и ничего не даёт взамен.

**What the first audit got right:** только после SQL, отдельной миграцией.

**What the first audit missed:** выгода нулевая, задача не должна висеть в backlog.

**Recommendation:** remove from backlog.

### TECH-DEBT-013 — не удалять rating stats reconcile

**Verdict:** CONFIRMED

**Evidence:**
- `drizzle/0079_media_item_rating_stats.sql` — trigger + seed job `media-item-rating-stats-reconciliation` (`0 1 * * *`).
- Reconcile в `src/db/queries/media-item-rating-stats.ts` считает по всем `ratings`.
- Путь без trigger-эффекта в событиях: `deleteAuthorDraftMediaItem` удаляет чужие ratings без domain events. Это ещё один аргумент оставить сверку.

**What the first audit got right:** всё.

**What the first audit missed:** ничего существенного.

**Recommendation:** leave alone.

### TECH-DEBT-014 — живые `jobs.enabled`

**Verdict:** CONFIRMED (как вопрос)

**Evidence:**
- Seed-и с `ON CONFLICT DO NOTHING`. `auth-email-outbox-delivery` и `auth-cleanup` (`0054`), `media-editorial-summaries` (`0086`) — `enabled=false`.
- Остальные (`domain-events-recovery`, `notification-transport-delivery`, `cover-thumbnails-backfill`, metadata backfill/refresh, rating reconcile, `jobs-history-cleanup`) — `true`.
- Письма уходят только через job, прямого вызова `deliverPendingAuthorEmails` из actions нет.

**What the first audit got right:** seed ≠ prod; не менять флаги из аудита.

**What the first audit missed:**
- `enabled` мало. Нужно ещё отставание очереди (`started_at - available_at`) и наличие живого worker-а: включённый job без worker-а выглядит так же, как выключенный.
- Выключенный `auth-cleanup` означает, что `author_sessions` и `pending_email`-аккаунты не чистятся.

**Recommendation:** investigate first — это первая строка checklist.

### TECH-DEBT-015 — реплики worker и дубли Telegram

**Verdict:** VALID BUT LOW VALUE

**Evidence:**
- `deliverPendingNotificationTransports`: send → complete. Lease 30 с, Telegram timeout 10 с (`transports/telegram-api.ts`).
- PK `(event_id, transport, recipient)` в `drizzle/0085`.

**What the first audit got right:** at-least-once есть; решение по idempotency — после проверки Bot API.

**What the first audit missed:**
- Bot API `sendMessage` не поддерживает idempotency key. «Решение» — принять at-least-once.
- Несколько реплик почти не усиливают риск: timeout 10 с < lease 30 с, второй worker не заберёт строку, пока первый в пределах send.
- Реальные окна дубля: crash между send и complete, ошибка БД на complete, timeout, после которого Telegram всё-таки доставил.
- Предложенная проверка (повторные `delivered`) невозможна из-за PK.

**Recommendation:** remove from backlog. Прокси-метрика — в checklist.

### TECH-DEBT-016 — carrier-specific rating panel

**Verdict:** CONFIRMED (не трогать)

**Evidence / got right:** визуальная матрица носителей — продуктовое требование.

**Missed:** —

**Recommendation:** leave alone.

### TECH-DEBT-017 — слияние email outbox и domain events

**Verdict:** CONFIRMED (не трогать)

**Evidence:** у email шифрованный payload (`email-outbox-crypto.ts`), lease 15 мин и Resend idempotency key. У Telegram другой транспорт и другие гарантии.

**Got right:** объединение не чинит ни одного бага.

**Missed:** —

**Recommendation:** leave alone.

### TECH-DEBT-018 — массовый перенос queries → operations

**Verdict:** CONFIRMED (не трогать)

**Recommendation:** leave alone.

### TECH-DEBT-019 — moment и AI-клиенты

**Verdict:** CONFIRMED (не трогать)

**Recommendation:** leave alone.

### TECH-DEBT-020 — свёртка распределений и литерал `published`

**Verdict:** VALID BUT LOW VALUE

**Evidence:** совпадающие формулы. Литерал `"published"` встречается и в `demo-profile-import.ts`.

**Missed:** —

**Recommendation:** remove from backlog; править попутно без отдельной задачи.

### Removal candidates вне нумерации

- **Redirects в `next.config.ts`.** `/franchises/*` → `/series/*`, `/series/:code` → `/archive?series=` и admin/author аналоги — `permanent: true`. Браузеры и поисковики кэшируют 308, внешние ссылки живут годами. Не удалять. Цепочка `/franchises/x` → `/series/x` → `/archive?series=x` даёт двойной redirect: это единственное, что можно улучшить (направить сразу в конечный URL), и только при касании.
- **`?review=`.** `src/app/media/[code]/page.tsx:80` читает `legacyReviewId`. Ссылки из уведомлений и шаринга — не удалять.
- **`legacyMediaItem` в `src/lib/activity-logs/model.ts`.** Activity log хранится бессрочно, старые payload будут всегда. Удалять нельзя, пока не мигрированы строки. Выгода мигрировать нулевая.
- **Deprecated `getMediaTypeOptions`.** Живой alias с импортами. Удаление = переименование.
- **Старые internal auth routes.** В репозитории их нет (см. TECH-DEBT-002). Проверить только внешний cron по access-логам.

С первым аудитом по этим пунктам согласен.

## Domain event reliability verdict

**Корректно, и сделано лучше среднего:**
- Событие пишется в той же транзакции, что агрегат (`runInDomainEventTransaction`, `src/db/transaction.ts`).
- Dispatch — одна транзакция с `FOR UPDATE` на outbox-строку. Claim consumer-а через `domain_event_consumptions` с `ON CONFLICT DO NOTHING`, эффект consumer-а в той же транзакции. Consumers пишут только в БД, поэтому эффект атомарен и фактически exactly-once.
- Ошибка любого consumer-а откатывает всё, событие остаётся pending. Частичного состояния нет.
- Fast-path после commit + cron `domain-events-recovery` каждую минуту закрывают потерю enqueue.
- Внешний транспорт (Telegram) вынесен в отдельный outbox, в транзакции dispatch сети нет.

**Реальные слабые места:**
1. **Голодание recovery при ≥50 poison-строках** (см. TECH-DEBT-008). Сейчас маловероятно, зависит от будущих изменений каталога.
2. **Один poison consumer блокирует другие consumers того же события**: откат общий. Сейчас пересечения типов между achievements и notifications нет, поэтому это не баг, а ограничение, которое надо помнить при добавлении третьего consumer-а.
3. **Retention нет** для `domain_events`, `domain_event_outbox`, `domain_event_consumptions`, `notification_transport_outbox`. Рост линейный от активности. Для MVP это проблема через годы, не сейчас. Проверить размеры.
4. **Fan-out в job_runs.** Каждое событие — отдельный `domain-events.dispatch` run. Demo import N оценок создаёт N runs. При пропускной способности worker-а ≤1 run/с (см. ниже) это N секунд задержки всей очереди.

**Не проблема:** расхождение maxAttempts 3/5, `friend.accepted` без consumer, дубли dispatch (claim идемпотентен).

Kafka/RabbitMQ или смена outbox не нужны: текущая модель корректна для объёма MVP.

## Background jobs verdict

Цепочка: producer → `job_runs` (queued) / scheduler (`claimDueScheduledJobs`, `next_run_at` считается от `now`, catch-up лавины нет) → worker (`claimNextJobRun`, `FOR UPDATE SKIP LOCKED`, FIFO по `available_at`) → handler → finish/requeue с backoff → recovery-цикл снимает истёкшие lease каждые 30 с.

**Корректно:**
- Claim, lock token на finish/requeue, backoff, `lease-expired` → requeue или failed.
- Scheduler не плодит лавину: одна occurrence на тик, unique index на `(job_id, scheduled_for)`.
- Email: lease 15 мин + Resend idempotency key — дублей писем нет даже при повторах.
- Editorial: unique index активных run + rate limit 5/мин и 200/день в Redis + defer.
- Rating reconcile сам себя продолжает после commit — ок.

**Проблемы по убыванию важности:**

1. **Head-of-line blocking.**
   - Один worker, одна задача за раз, FIFO без приоритетов.
   - Handler, игнорирующий `signal`, держит worker сколько угодно: timeout срабатывает только после возврата handler-а.
   - Metadata backfill/refresh и cover thumbnails не передают `signal`; cover `fetch` без timeout.
   - Письма подтверждения email и сброса пароля ждут в той же очереди.
   - Лечится таймаутом в cover fetch (TECH-DEBT-007). Отдельный worker не нужен.
2. **Искусственный потолок ≈1 run/с.** `runClaimLoop` (`src/jobs/worker.ts`) ждёт `JOB_WORKER_POLL_MS` (1000 мс) после **каждой** итерации, даже когда run был найден. Demo import на 300 оценок = 300 dispatch runs ≈ 5 минут задержки для писем. Минимальная правка: ждать только при пустой очереди или ошибке. Failed runs уходят с backoff, tight loop не возникнет. Сначала проверить реальное отставание в prod.
3. **Повторное выполнение после timeout.** Recovery снимает lease у ещё работающего run. Когда handler закончит, finish не пройдёт по токену, run выполнится снова. Все текущие handlers идемпотентны (attempt-маркеры, `ON CONFLICT`, idempotency key) — сейчас это лишняя работа, не порча данных.
4. **Нет «один активный run на job»** (кроме editorial). При блокировке every-minute jobs копятся по одному run в минуту. Безвредно из-за идемпотентности.

По конкретным контурам:

| Контур | Статус |
|---|---|
| Auth email | Живой код; доставка только через cron `auth-email-outbox-delivery` (seed disabled) → verify |
| Auth cleanup | Seed disabled → сессии и `pending_email` копятся; удаление `pending_email` корректно исключает аккаунты с данными → verify |
| Domain event recovery | Корректен, кроме голодания → verify pending |
| Notification transport | At-least-once, принять |
| Thumbnail backfill | Запасной путь к enqueue с catch+log; MinIO-fetch без timeout, но во внутренней сети — low |
| Editorial summaries | Seed disabled, защиты от дублей и лимиты есть → verify только если ожидается работа |
| Rating stats reconcile | Корректен, оставить |

Замена job system не нужна.

## Demo import verdict

Trust boundary корректна:

- `importDemoProfileAction` требует `getCurrentAuthor()` (он отсекает заблокированных) и прогоняет вход через `parseDemoProfile`: score 10…100 шаг 10, дата по паттерну, статусы по whitelist.
- `importDemoProfile` берёт только `published` записи публично доступных и доступных автору типов. Ставит advisory lock на `(author, item)`, пропускает занятые записи, вставляет с `ON CONFLICT DO NOTHING`.
- Повторный импорт идемпотентен. `profile.import.importedAt` — клиентский флаг, его обход ничего не даёт.
- Полномочия импорта не шире обычного `src/app/ratings/actions.ts`: та же `getCurrentAuthor`, rate limit нет ни там, ни там.

Мелкие расхождения (не баги безопасности):

1. **Нет проверки `isFirstExperienceBeforeRelease`.** Серверная action оценки её делает. Импорт может записать дату опыта раньше года выхода. Эффект — косметика в профиле. Do when touching.
2. **Нет лимита на число записей.** Ограничено числом published-записей и body limit (server actions 6 MB; nginx из репо — дефолт `client_max_body_size` 1m). Главный эффект — fan-out N job runs (см. jobs). Do when touching: лимит в `parseDemoProfile` порядка разумного demo-объёма.

Demo endpoints `api/demo-achievements` и `api/demo-home-statistics` публичны намеренно и режут входной список (`DEMO_RATING_PROGRESS_CODE_LIMIT`, `DEMO_HOME_STATISTICS_CODE_LIMIT`). Проблемы нет.

## Cover provider reliability verdict

**User-facing risk — medium.**
- `/api/cover-candidates`, `/api/media-title-candidates`, `/api/media-title-metadata` доступны только автору или админу, с rate limit.
- Зависший вендор держит запрос до 300 с (undici). nginx из репо без `proxy_read_timeout` отдаст 504 через 60 с, а сервер продолжит ждать.
- Страдает форма записи, но не публичный архив.

**Background job risk — high.** См. `Background jobs verdict`, пункт 1: блокируется вся очередь, включая auth email.

**Observability risk — low/medium.**
- `fetchJson` превращает любой non-OK в `null`, поэтому «нет метаданных» неотличимо от 429/5xx.
- `ProviderHttpError` из `fetchSearchJson` не несёт `code`, и vendor 429 маппится в `provider-unavailable`, а не в `provider-rate-limit` (`getProviderExecutionError` смотрит только на `code`).
- Timeout сейчас не отличим от долгого ответа.

**Минимальный API** — одна функция в `shared.ts`, без новых зависимостей:

```ts
const PROVIDER_FETCH_TIMEOUT_MS = 15_000

export function withProviderTimeout(signal?: AbortSignal | null) {
  const timeout = AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
```

Где применить:
- `fetchJson` / `fetchSearchJson`: `fetch(url, { ...init, signal: withProviderTimeout(init?.signal), headers: ... })`.
- Все `fetch` в `igdb.ts` (games и token).

Почему этого достаточно:
- `AbortSignal.timeout` обрывает и чтение тела.
- Ошибка `TimeoutError` уже ловится: `Promise.allSettled` в search и `try/catch` в `getTitleMetadata` (`registry.ts:540`) превращают её в `provider-unavailable`.
- Metadata jobs трактуют `provider-unavailable` как `retryable` и ставят `metadata_attempted_at`. Элемент уходит в конец ротации (`asc nulls first`), а не теряется.

Про значение timeout:
- 15 с — осознанно больше, чем 8 с у Roblox. Слишком короткий timeout на медленных вендорах (FantLab, Open Library) даст ложные «provider-error» в metadata.
- Точное значение стоит сверить с p95 по логам, если они есть. Выбирать число без данных не буду.

Не нужно сейчас: circuit breaker, retry внутри fetch, прокидывание `signal` job-а в провайдеры. Timeout на запрос уже ограничивает job сверху. Логирование статуса в `fetchJson` — do when touching.

## Media / franchise architecture verdict

TECH-DEBT-011 в предложенном виде (вынести функции смены статуса в соседние модули с реэкспортом) не оправдан. Это переезд кода: поведение не меняется, риск регрессий импортов реален.

Реальная связность, найденная по коду:

1. **Submit записи и перенос её серий — две транзакции.**
   - `src/app/author/(protected)/media/actions.ts` (блоки около 693–712 и 978–997) вызывает `submitAuthorMediaItemForPublication`, затем отдельным вызовом `moveAuthorFranchisesForMediaSubmission` (`src/db/queries/franchises.ts:1171`).
   - Сбой второго шага оставляет запись submitted/published, а её приватные серии — в старом статусе.
   - `reviewSubmittedAuthorMediaItem` при этом обновляет серии в той же транзакции — то есть в одном месте правильно, в другом нет.
   - Fix when touching: провести оба шага через одну транзакцию. Функции уже принимают или могут принять `tx`: это передача параметра, а не новый слой.
2. **Удаление автором задевает чужие данные** — см. `Serious issues missed by first audit`, пункт 2.
3. **`updateAdminMediaItemPublicationStatus` без проверки текущего статуса в WHERE.** Админ может перевести submitted в private или published в обход review. Это admin-only и, вероятно, намеренно. Не задача.

Разрезание `media-items.ts` / `franchises.ts` по файлам — leave alone.

## Serious issues missed by first audit

### 1. Server action без авторизации: `deleteAchievementLevelAction`

- **Где:** `src/app/admin/(protected)/achievements/actions.ts:361`. Все остальные actions файла начинаются с `await requireAdminUser()`, эта — нет.
- **Проверка охвата:** скрипт по всем 46 файлам с `"use server"`. Без auth-вызова остались только публичные по смыслу actions (login/register/forgot/reset/logout) и `src/lib/activity-logs/server.ts` (см. пункт 5). Middleware/proxy в репозитории нет.
- **Сценарий:**
  - Action импортирована в client component `achievement-levels-tab.tsx:213`, её ID попадает в клиентский JS.
  - Любой, кто знает ID (бывший админ, любой, кто видел чанк), вызывает её POST-запросом без сессии.
  - `deleteAchievementLevel` (`src/db/queries/achievements.ts:550`) удаляет невыданный и не последний уровень, перенумеровывает остальные и удаляет картинки уровня из S3.
- **Вред:** порча конфигурации ачивок и потеря загруженных изображений. Пользовательские награды не затрагиваются: выданные уровни не удаляются. Секретность ID не является механизмом авторизации.
- **Фикс:** первой строкой `await requireAdminUser()`. Регрессионный риск нулевой.
- **Тест:** в проекте уже есть паттерн source-контрактов (`tests/achievement-settings.test.ts:81`, `assert.match(action, /requireAdminUser\(\)/)`). Добавить такой же для этой action.

### 2. Автор может удалить чужие оценки через снятую с публикации запись

- **Где:**
  - `deleteAuthorDraftMediaItem` (`src/db/queries/media-items.ts:1373`).
  - `canAuthorDeleteMediaItem` (`src/lib/authors/media-publication.ts`) разрешает `private`/`rejected`.
  - `updateAdminMediaItemPublicationStatus` (`media-items.ts:1555`) — кнопка «Снять с публикации».
- **Сценарий:**
  1. Запись автора опубликована, другие пользователи ставят оценки и дату опыта.
  2. Админ снимает её с публикации → `private`.
  3. Автор видит «удалить» и удаляет.
  4. Код удаляет `author_media_experiences` и `ratings` по `media_item_id` **без фильтра `author_id`**. `author_media_statuses` чужих пользователей уходят каскадом.
- Domain events не пишутся, ачивки не пересчитываются, stats чинит trigger.
- Если на запись ссылаются рецензии, квизы или contributions без cascade, удаление падает FK-ошибкой — это второй, менее вредный исход.
- Тест `tests/author-media-delete-query.test.ts` называется «removes author-owned rating data», то есть намерение — удалять только данные автора. Код с намерением расходится.
- **Частота:** требует редкой комбинации действий. Ущерб необратим (чужие данные без событий).
- **Фикс:** запретить удаление, если есть оценки, опыт или статусы других авторов (count в той же транзакции → вернуть понятную ошибку), либо удалять только строки `author_id = input.authorId`. Первый вариант безопаснее: запись с чужими данными — уже не черновик.
- Сначала — production check ниже.

### 3. Очередь jobs блокируется одной долгой задачей

См. `Background jobs verdict`, пункты 1–2. Отдельно от TECH-DEBT-007 здесь стоит только вопрос паузы 1 с после каждого run. Это verify first: смотреть реальное отставание очереди.

### 4. Submit записи и перенос серий в разных транзакциях

См. `Media / franchise architecture verdict`, пункт 1. Серьёзность средняя: частичное состояние видно в модерации, данные не теряются.

### 5. `src/lib/activity-logs/server.ts` помечен `"use server"`

- Экспортирует `logActivity` / `prepareActivityLog`, принимающие произвольный `LogActivityInput`: action, actor, severity, metadata.
- Сейчас его импортируют только серверные модули (34 файла, ни одного `"use client"`). Next не отдаёт клиенту ID actions, на которые не ссылается клиентский код, поэтому практической эксплуатации нет.
- Но это заряженное ружьё: первый же импорт из client component откроет публичную запись в журнал безопасности от имени любого актора.
- Fix when touching: заменить директиву на `import "server-only"`, как у соседних серверных модулей.

## Production verification checklist

Все SQL — read-only. `psql "$DATABASE_URL"` подразумевает подключение к production-БД на чтение.

## Production check: jobs enabled and schedule

**Why:** seed не отражает prod (TECH-DEBT-014). Без `auth-email-outbox-delivery` письма не уходят вообще.

**Command:**
```sql
select code, type, enabled, cron_expression, next_run_at, max_attempts, timeout_seconds
from jobs order by code;
```

**How to interpret:**
- `auth-email-outbox-delivery.enabled = false` → письма не доставляются: инцидент.
- `domain-events-recovery = false` → потеря событий при сбое fast-path.
- `auth-cleanup = false` → копятся сессии и `pending_email`.
- `next_run_at` сильно в прошлом при `enabled = true` → scheduler не работает.

## Production check: worker and scheduler are alive

**Why:** включённый job без процесса выглядит как выключенный.

**Command:**
```bash
docker compose ps jobs-worker jobs-scheduler
docker compose logs --since 24h jobs-worker | grep -c "iteration failed"
```
```sql
select locked_by, count(*) from job_runs
where started_at > now() - interval '1 day' group by 1;
```

**How to interpret:**
- Несколько `locked_by` → несколько реплик.
- Пусто при enabled jobs → worker не работает.
- Ошибки итераций → смотреть текст.

## Production check: queue latency

**Why:** head-of-line blocking и потолок 1 run/с (Background jobs, пункты 1–2).

**Command:**
```sql
select type,
       count(*) as runs,
       percentile_cont(0.5) within group (order by extract(epoch from started_at - available_at)) as p50_wait_s,
       max(extract(epoch from started_at - available_at)) as max_wait_s,
       max(extract(epoch from finished_at - started_at)) as max_run_s
from job_runs
where started_at > now() - interval '7 days'
group by type order by max_wait_s desc;

select count(*), min(available_at) from job_runs
where status = 'queued' and available_at <= now();
```

**How to interpret:**
- `max_wait_s` у `auth.email-outbox-delivery` в минутах → письма задерживаются, правка паузы worker-а и timeout оправданы.
- `max_run_s` у metadata jobs около `timeout_seconds` или больше → подтверждение TECH-DEBT-007.
- Большой queued backlog с давним `min(available_at)` → worker не успевает.

## Production check: failed and expired runs

**Why:** видеть timeout, `lease-expired` и poison jobs.

**Command:**
```sql
select type, error_code, count(*), max(finished_at)
from job_runs where status = 'failed' and finished_at > now() - interval '30 days'
group by 1, 2 order by 3 desc;

select id, type, locked_by, lock_expires_at from job_runs
where status = 'running' and lock_expires_at < now();
```

**How to interpret:**
- `timeout` / `lease-expired` у metadata или thumbnail → зависания вендоров реальны.
- Running с истёкшим lease дольше 30 с → recovery-цикл не работает.
- Много failed `domain-events.dispatch` → смотреть pending outbox (следующая проверка).

## Production check: domain event outbox backlog

**Why:** голодание recovery и poison (TECH-DEBT-008).

**Command:**
```sql
select e.type, count(*), min(o.created_at) as oldest
from domain_event_outbox o join domain_events e on e.id = o.event_id
where o.dispatched_at is null
group by 1 order by 2 desc;

select count(*) from domain_event_outbox
where dispatched_at is null and created_at < now() - interval '5 minutes';
```
```bash
docker compose logs --since 7d jobs-worker | grep -c "Failed to recover pending domain event"
docker compose logs --since 7d jobs-worker web | grep -c "Failed to enqueue immediate domain event dispatch"
```

**How to interpret:**
- 0 старше 5 минут → TECH-DEBT-008 можно оставить.
- Несколько «вечных» строк → poison, смотреть тип и лог ошибки.
- ≥50 → recovery голодает, делать правку.

Имя сервиса веб-приложения в compose сверить с deploy.

## Production check: `friend.accepted` pending

**Why:** безопасность будущего удаления типа (TECH-DEBT-004).

**Command:**
```sql
select count(*) filter (where o.dispatched_at is null) as pending, count(*) as total
from domain_events e join domain_event_outbox o on o.event_id = e.id
where e.type = 'friend.accepted';
```

**How to interpret:** pending должно быть 0 перед любым изменением каталога.

## Production check: email outbox

**Why:** доставка auth-писем.

**Command:**
```sql
select status, count(*), min(created_at), max(attempts)
from email_outbox group by status;

select template, last_error, count(*) from email_outbox
where status = 'failed' group by 1, 2 order by 3 desc limit 20;
```

**How to interpret:**
- Старые `pending` → job выключен или очередь стоит.
- `sending` старше 15 минут → worker умер посреди доставки (lease вернёт).
- `failed` с 4xx Resend → проблема конфигурации провайдера.

## Production check: notification transport outbox

**Why:** at-least-once Telegram (TECH-DEBT-015). Дубли по PK в БД невозможны, смотрим прокси.

**Command:**
```sql
select status, count(*), max(attempts) from notification_transport_outbox group by 1;

select count(*) from notification_transport_outbox
where status = 'delivered' and attempts > 1;

select last_error, count(*) from notification_transport_outbox
where last_error is not null group by 1 order by 2 desc limit 20;
```

**How to interpret:**
- `delivered` с `attempts > 1` и `last_error` про timeout → кандидаты на дубль в чате.
- Единицы — принять.
- Много `failed` → конфигурация бота.

## Production check: author items with other users' data

**Why:** серьёзность проблемы удаления автором (Serious issue 2).

**Command:**
```sql
select m.id, m.code, m.publication_status, m.created_by_author_id,
       count(distinct r.author_id) filter (where r.author_id <> m.created_by_author_id) as foreign_raters,
       count(distinct s.author_id) filter (where s.author_id <> m.created_by_author_id) as foreign_statuses
from media_items m
left join ratings r on r.media_item_id = m.id
left join author_media_statuses s on s.media_item_id = m.id
where m.created_by_author_id is not null
  and m.publication_status in ('private', 'rejected')
group by m.id
having count(distinct r.author_id) filter (where r.author_id <> m.created_by_author_id) > 0
    or count(distinct s.author_id) filter (where s.author_id <> m.created_by_author_id) > 0;
```
```sql
select actor_type, count(*) from admin_activity_logs
where action = 'media.deleted' and created_at > now() - interval '180 days'
group by 1;
```

**How to interpret:**
- Любая строка в первом запросе → сейчас есть запись, удаление которой автором снесёт чужие данные: фикс переходит в Fix now.
- Пусто → риск латентный, фикс при касании модерации.
- Второй запрос — оценить, удаляют ли авторы записи вообще: смотреть строки с `actor_type` автора.

## Production check: `auth_method` values

**Why:** закрыть TECH-DEBT-005/012.

**Command:**
```sql
select auth_method, count(*), max(created_at) from author_sessions group by 1;
```

**How to interpret:** `telegram` > 0 — неожиданность, выяснить происхождение. Иначе задачи просто удаляются из backlog.

## Production check: table sizes (retention)

**Why:** у event/outbox-таблиц нет очистки.

**Command:**
```sql
select relname, pg_size_pretty(pg_total_relation_size(relid)) as size, n_live_tup
from pg_stat_user_tables
where relname in ('domain_events', 'domain_event_outbox', 'domain_event_consumptions',
                  'notification_transport_outbox', 'email_outbox', 'job_runs',
                  'author_sessions', 'admin_activity_logs')
order by pg_total_relation_size(relid) desc;
```

**How to interpret:**
- Сотни MB и рост → планировать retention.
- Единицы MB → не трогать.
- Большой `author_sessions` → включить `auth-cleanup`.

## Production check: rating stats drift

**Why:** подтвердить, что reconcile нужен и работает (TECH-DEBT-013).

**Command:**
```sql
select count(*) from media_item_rating_stats s
full join (select media_item_id, count(*)::int c, sum(score)::int sm from ratings group by 1) r
  using (media_item_id)
where coalesce(s.ratings_count, 0) <> coalesce(r.c, 0)
   or coalesce(s.score_sum, 0) <> coalesce(r.sm, 0);
```

**How to interpret:**
- 0 → trigger работает.
- \>0 сразу после 01:00 → reconcile не отработал, смотреть его runs.

## Production check: nginx and external callers

**Why:** timeout прокси для provider-запросов и старые internal cron.

**Command:**
```bash
sudo nginx -T 2>/dev/null | grep -E "proxy_read_timeout|client_max_body_size"
sudo grep -c "/api/internal/auth" /var/log/nginx/access.log*
crontab -l; sudo ls /etc/cron.d
```

**How to interpret:**
- Нет `proxy_read_timeout` → 60 с: provider-запросы дольше получают 504.
- Обращения к `/api/internal/auth-*` → найти и выключить внешний cron.
- `client_max_body_size` 1m ограничивает demo import и загрузку обложек: сверить с `bodySizeLimit: "6mb"` в `next.config.ts`.

Пути логов сверить с конкретным сервером.

## Fix now

1. **`await requireAdminUser()` первой строкой `deleteAchievementLevelAction`** + source-контракт в тестах по образцу `tests/achievement-settings.test.ts`. XS, риск нулевой.
2. **Timeout для cover provider fetch** (`withProviderTimeout` в `shared.ts` + все `fetch` в `igdb.ts`), 15 с. S. Проверка: `tests/cover-*` контракты + ручной поиск обложки в dev.

## Verify first

1. **Удаление автором записи с чужими данными** → `Production check: author items with other users' data`. Есть строки — сразу фикс (запрет удаления при чужих данных). Нет — фикс при касании модерации, но в ближайшем её касании.
2. **`jobs.enabled`, живость worker-а, отставание очереди** → три первые проверки. Отставание писем в минутах → убрать паузу после успешного run в `runClaimLoop`.
3. **Pending domain event outbox** → при ≥1 «вечной» строке делать `attempts` / `next_attempt_at` / `last_error`; при 0 — оставить.
4. **Размеры event/outbox-таблиц и `author_sessions`** → retention или включение `auth-cleanup`.
5. **nginx `proxy_read_timeout` / внешние вызовы `/api/internal/auth-*`.**

## Fix when touching

- Submit записи и `moveAuthorFranchisesForMediaSubmission` — в одну транзакцию.
- `src/lib/activity-logs/server.ts`: `"use server"` → `import "server-only"`.
- Demo import: проверка `isFirstExperienceBeforeRelease` и лимит числа записей в `parseDemoProfile`.
- `fetchJson`: логировать HTTP-статус; `ProviderHttpError` с 429 → `code: "provider-rate-limit"`.
- Выровнять maxAttempts fast-path domain events с policy handler-а (3 → 5).
- Лог причины отказа Turnstile (TECH-DEBT-009).
- Общий `parsePage` на странице ачивок (TECH-DEBT-010), удобно вместе с Fix now №1.
- Двойной `timestamps()` (TECH-DEBT-003).
- Мёртвый кластер архивной сетки целиком (TECH-DEBT-001).
- Двойной redirect `/franchises/*` → конечный URL.

## Drop from backlog

- TECH-DEBT-002 — каталогов нет в git.
- TECH-DEBT-005, TECH-DEBT-012 — сужение `auth_method` ничего не даёт.
- TECH-DEBT-006 — валидация уже есть.
- TECH-DEBT-011 в формулировке «перенести функции статусов» — заменён двумя точечными задачами выше.
- TECH-DEBT-015 — at-least-once Telegram принять; idempotency в Bot API нет.
- TECH-DEBT-020 — только попутно.
- TECH-DEBT-004 как задача — leave alone; при удалении соблюдать порядок из ревью.
- TECH-DEBT-013, 016, 017, 018, 019 — остаются как решения «не трогать», не как задачи.

## Final self-review

Попытка опровергнуть каждый пункт Fix now.

**1. `deleteAchievementLevelAction` без auth.**
- *Контраргумент:* action может защищать layout `(protected)` или middleware.
  *Проверка:* layout не выполняется при прямом POST server action на другой route, Next документирует server actions как публичные endpoints. `middleware.ts` / `proxy.ts` нет ни в корне, ни в `src/`.
- *Контраргумент:* ID action не узнать.
  *Проверка:* он в клиентском чанке admin-страницы; секретность ID не является контролем доступа, и это единственное исключение среди всех admin actions — явно пропуск, а не решение.
- *Контраргумент:* вред мал.
  *Проверка:* да, выданные награды не страдают. Но фикс — одна строка без риска, и держать открытый authz-путь ради экономии одной строки нет смысла.
- **Остаётся в Fix now.**

**2. Timeout cover providers.**
- *Контраргумент:* вендоры на практике не зависают, проблема теоретическая.
  *Проверка:* подтвердить или опровергнуть без логов prod я не могу. Но сама правка дешёвая (одна функция, два места + IGDB), обратимая, и ошибка уже обрабатывается существующими путями как `provider-unavailable`.
- *Контраргумент:* timeout может дать ложные пустые результаты.
  *Проверка:* поэтому 15 с, а не 5, и metadata jobs ставят retryable-попытку в конец ротации, не теряя элемент.
- *Контраргумент:* без передачи `signal` в handlers job всё равно может идти долго.
  *Проверка:* верно, но верхняя граница становится конечной — примерно `items × запросы × 15 с` вместо `× 300 с`, — и этого достаточно, чтобы очередь не стояла часами.
- Цена ошибки в сторону «не сделать» — задержка auth-писем на часы при сбое любого из ~10 вендоров. Цена «сделать зря» — 15 строк кода.
- **Остаётся в Fix now.** Точное значение timeout стоит пересмотреть по данным `Production check: queue latency`.

**3. Удаление автором чужих данных — почему не Fix now.**
- *Контраргумент к собственному выводу:* ущерб необратим, почему не чинить сразу?
- *Ответ:* сценарий требует снятия с публикации админом и последующего удаления автором. Частоту без prod-данных я не знаю, а выбор между «запретить удаление» и «удалять только своё» — продуктовое решение: что должен видеть автор, если на его запись уже есть чужие оценки.
- Проверка занимает один SQL. При любой найденной строке задача немедленно становится Fix now.

**4. Что снято при самопроверке.**
- Первоначально я считал весь модуль `tile-grid-capacity.ts` мёртвым. Повторный поиск показал живые константы в `responsive-tile-grid.tsx` и `random-franchise-section.tsx`. Мёртвы только функции и два orphan-компонента — вывод по TECH-DEBT-001 скорректирован.
- «Author profile actions без auth» из первичного скана оказались ложной тревогой: они используют `getCurrentAuthorSession`. В финальный текст не вошли.
- Отдельный worker для email, приоритеты в очереди, Kafka/RabbitMQ, circuit breaker для провайдеров — не предлагаются: необходимость не доказана, минимальные правки выше закрывают наблюдаемые риски.
