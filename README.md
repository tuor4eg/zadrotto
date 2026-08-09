# Zadrotto

«Журнал, которого не было» — Next.js-приложение для картотеки игр, фильмов, сериалов, книг, комиксов, аниме и других культурных записей.

Сейчас проект включает публичный архив, кабинет автора, админку, оценки и рецензии, серии, обложки, импорт метаданных и вспомогательные AI-сценарии. Подробнее о продуктовых границах — в [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md).

## Стек

- Next.js 16, React 19, TypeScript;
- PostgreSQL и Drizzle ORM;
- Tailwind CSS;
- S3-compatible storage для обложек;
- Redis для rate limit;
- `node:test` через `tsx`.

## Локальный запуск

Требуются Node.js 20+, PostgreSQL и Redis. Для работы с обложками нужен S3-compatible storage; локально можно использовать MinIO.

1. Подготовь окружение:

```bash
cp .env.example .env
npm install
```

2. Укажи в `.env` как минимум:

```env
DATABASE_URL=postgres://user:password@localhost:5432/zadrotto
SITE_URL=http://localhost:3000
ADMIN_LOGIN=admin
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=change-this-to-a-long-random-secret
AUTHOR_SESSION_SECRET=change-this-to-another-long-random-secret
AI_PROVIDER_CREDENTIALS_KEY=change-this-to-a-separate-long-random-ai-provider-key
REDIS_URL=redis://127.0.0.1:6379
```

Секреты сессий и ключи шифрования должны быть длинными случайными значениями. `ADMIN_PASSWORD` используется только seed-скриптом; в базе хранится hash.

3. Накати миграции и создай первого администратора:

```bash
npm run db:migrate
npm run db:seed:admin
```

4. Запусти приложение:

```bash
npm run dev
```

Основные адреса:

- публичный архив — <http://localhost:3000>;
- админка — <http://localhost:3000/admin>;
- вход автора — <http://localhost:3000/author/login>.

Администратор входит по логину и паролю. Автор использует выданный администратором access token либо регистрацию, если она включена. Сессии хранятся в `httpOnly` cookie; исходные access token в базе не сохраняются.

## Обложки и MinIO

Поднять Redis и MinIO из production compose-файла для локальной разработки можно так:

```bash
docker compose --profile local up -d redis minio
```

Консоль MinIO будет доступна на <http://localhost:9001>. Создай bucket из `S3_BUCKET` и разреши публичное чтение объектов. Настройки подключения уже перечислены в `.env.example`.

Приложение умеет загружать обложки, искать варианты через настроенных провайдеров и создавать уменьшенные версии. `media_items.cover_url` поддерживает object key внутри bucket и готовый `http(s)` URL.

Для существующих обложек можно запустить:

```bash
npm run covers:backfill-thumbs
```

## Внешние и AI-провайдеры

Источники названий, метаданных и обложек настраиваются в разделе инструментов администратора.

AI настраивается в `/admin/tools/ai`:

1. В «Провайдерах» сохрани credentials, обнови список моделей и выбери модель по умолчанию.
2. Проверь модель тестовым prompt.
3. В «Сценариях» настрой и включи нужную системную операцию.

Сейчас зарегистрированы OpenRouter и прямой DeepSeek API, а также сценарий «Предложить серии». Сценарий наследует модель и параметры провайдера, если они явно не переопределены. Credentials шифруются ключом `AI_PROVIDER_CREDENTIALS_KEY` и не передаются в браузер или логи. AI-результат всегда проверяется сервером и не считается источником истины.

## Регистрация авторов и email

Регистрация управляется переменной `AUTHOR_REGISTRATION_ENABLED` и настройками в `/admin/settings/authors`. Для локальной разработки можно задать:

```env
AUTHOR_REGISTRATION_SKIP_EMAIL_VERIFICATION=true
```

В production эта опция игнорируется. Email credentials и очередь настраиваются в `/admin/tools/email`; для них нужны `EMAIL_OUTBOX_ENCRYPTION_KEY` и `EMAIL_PROVIDER_CREDENTIALS_KEY`. Доставку писем и очистку auth-данных выполняет универсальный jobs worker.

## Универсальные фоновые задачи

Периодические определения хранятся в `jobs`, а каждый запуск — в `job_runs`. Scheduler читает только cron-расписания (пять частей, UTC) и создаёт запуски; worker получает только `job_runs` и выбирает обработчик по типу. Ручные и событийные операции используют тот же `enqueueJobRun` из `src/lib/jobs/queue.ts`.

Для запуска процессов вне Next.js доступны:

```bash
npm run jobs:scheduler
npm run jobs:worker
```

В Compose используются образы `ghcr.io/tuor4eg/zadrotto-jobs:latest`; worker можно масштабировать без изменения логики очереди:

```bash
docker compose up -d jobs-scheduler jobs-worker
docker compose up -d --scale jobs-worker=2 jobs-worker
```

Миграция создаёт задания `auth.email-outbox-delivery` и `auth.cleanup` выключенными. После первого развёртывания их нужно включить в `/admin/tools/jobs`; расписание и история запусков управляются там же.

## Production compose

`docker-compose.yml` использует готовые образы приложения, migrator и Node runner для фоновых задач:

```bash
docker compose --profile migrate run --rm migrate
docker compose --profile seed run --rm seed-admin
docker compose up -d app redis jobs-scheduler jobs-worker
```

Перед запуском заполни production `.env` и установи `SECURE_COOKIES=true`.

## Команды

```bash
npm run dev              # dev-сервер
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm test                 # тесты
npm run check            # typecheck, lint и тесты
npm run db:generate      # создать миграцию Drizzle
npm run db:migrate       # применить миграции
npm run db:seed:admin    # создать первого администратора
npm run jobs:scheduler   # scheduler фоновых задач
npm run jobs:worker      # worker фоновых задач
```

Production build автоматически после обычных изменений не запускается:

```bash
npm run build
```
