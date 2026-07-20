# Zadrotto

Локальный Next.js-проект для ранней картотеки культурных тайтлов.

## Локальный запуск

1. Подними PostgreSQL и укажи подключение в `.env`.
2. Установи зависимости:

```bash
npm install
```

3. Накати локальную схему:

```bash
npm run db:migrate
```

4. Создай первого admin user:

```bash
npm run db:seed:admin
```

Seed читает `ADMIN_LOGIN` и `ADMIN_PASSWORD` из `.env`, хранит только hash пароля и пропускает создание, если admin user уже существует.

5. Запусти dev-сервер:

```bash
npm run dev
```

Приложение будет доступно на http://localhost:3000.

## Admin

Для пустой админки и авторского входа нужны env-переменные:

```env
ADMIN_LOGIN=admin
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=change-this-to-a-long-random-secret
AUTHOR_SESSION_SECRET=change-this-to-another-long-random-secret
```

`ADMIN_PASSWORD` используется только seed-скриптом. В базе хранится `password_hash`.

После seed админка доступна на http://localhost:3000/admin. Сессия хранится только в `httpOnly` cookie `admin_session`; `localStorage` и bearer token не используются.

## Author

Авторский вход доступен на http://localhost:3000/author/login. Он принимает одноразово показанный в админке access token, сверяет только hash из таблицы `author_access_tokens` и создает `httpOnly` cookie `author_session`. Исходный access token не хранится ни в базе, ни во фронтенде.

## MinIO для обложек

UI загрузки пока нет. Поле `media_items.cover_url` уже достаточно: в нем можно хранить либо полный публичный URL, либо object key внутри S3-бакета, например `covers/dune.jpg`.

Для локального S3-compatible storage можно поднять MinIO:

```bash
docker run --rm \
  --name zadrotto-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v zadrotto-minio-data:/data \
  quay.io/minio/minio server /data --console-address ":9001"
```

После запуска:

1. Открой http://localhost:9001.
2. Войди с `minioadmin` / `minioadmin`.
3. Создай bucket `zadrotto-covers`.
4. Сделай bucket публичным для чтения объектов.
5. Загружай будущие обложки, например в префикс `covers/`.

Минимальная локальная env-конфигурация:

```env
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=zadrotto-covers
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://127.0.0.1:9000/zadrotto-covers
```

Если `cover_url` равен `covers/dune.jpg`, приложение покажет обложку по публичному URL:

```txt
http://127.0.0.1:9000/zadrotto-covers/covers/dune.jpg
```

Если `cover_url` уже содержит `https://...` или `http://...`, он используется без изменений.

## Production: регистрация авторов и фоновые задачи

Image-based deploy из `docker-compose.yml` включает два лёгких worker-контейнера:

- `email-worker` раз в минуту вызывает внутреннюю доставку email;
- `auth-cleanup-worker` раз в минуту проверяет расписание очистки; фактический интервал хранится в настройках Email.

Для приложения нужны `AUTHOR_REGISTRATION_ENABLED` (по умолчанию `false`), ключи
`EMAIL_OUTBOX_ENCRYPTION_KEY`, `EMAIL_PROVIDER_CREDENTIALS_KEY` и общий
`AUTH_EMAIL_WORKER_SECRET`. Одинаковое значение `AUTH_EMAIL_WORKER_SECRET` должно быть
передано приложению и обоим worker-контейнерам. Переменная
`AUTHOR_REGISTRATION_ACCESS_PROFILE_CODE` оставлена только как временный переходный fallback;
профиль новых авторов следует выбрать в `/admin/settings/authors`.

Worker-контейнеры не публикуют порты и не получают доступ к базе данных. Ошибки сети,
неуспешные HTTP-ответы и запуск раньше приложения повторяются через минуту. Оба worker’а
только опрашивают scheduler; параллельный запуск защищён DB lease.
Посмотреть их работу можно так:

```bash
docker compose logs -f email-worker auth-cleanup-worker
```

Для разового безопасного запуска email endpoint с тем же секретом:

```bash
docker compose run --rm --no-deps --entrypoint /bin/sh email-worker -c \
  'curl --fail-with-body --connect-timeout 5 --max-time 30 --request POST --header "Authorization: Bearer $AUTH_EMAIL_WORKER_SECRET" http://app:3000/api/internal/auth-email-outbox'
```

Для cleanup замени конечный путь на `/api/internal/auth-cleanup`.
