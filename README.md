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

4. Запусти dev-сервер:

```bash
npm run dev
```

Приложение будет доступно на http://localhost:3000.

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
