# Платформы: применение и проверка

Миграции применяются стандартной командой `npm run db:migrate` в порядке журнала:

1. `0120_normalized_platforms` — таблицы, ограничения и индексы.
2. `0121_platform_initial_mappings` — 102 canonical платформы и 212 mappings для IGDB/RAWG.
3. `0122_platform_backfill` — связи и заявки из игровых metadata, диагностика пропусков, сохранение результата удаляемых jobs.

JSON metadata не обновляется. CSV и сетевые запросы при миграции не нужны. До запуска версии приложения с платформами необходимо применить все три миграции. Worker должен работать с новой версией handlers для `media.platform-request-apply`.

Backfill выводит NOTICE с общим числом связей/заявок и WARNING с причинами пропусков и примерами ID. Некорректный массив целиком пропускается; строка считается одним названием, включая `Xbox Series X|S`. Без sourceProvider соответствия не угадываются. Значения неизвестного провайдера попадают в его собственные заявки.

После применения проверить:

```sql
SELECT count(*) FROM platforms;
SELECT provider, count(*) FROM provider_platform_mappings GROUP BY provider;
SELECT count(*) FROM media_item_platforms;
SELECT provider, count(*) FROM platform_requests WHERE decision IS NULL GROUP BY provider;
SELECT count(*) FROM media_item_platforms p JOIN media_items i ON i.id=p.media_item_id WHERE i.media_type <> 'game';
```

На чистом seed ожидаются 102 платформы и по 106 mappings IGDB/RAWG. Количество связей/заявок зависит от текущей БД; последняя проверка должна вернуть 0. Справочник: `/admin/platforms`; обработка: «Заявки → Платформы», включая вкладку всех заявок для failed/applying. Публичные ссылки: `/platforms`, `/archive?platform=pc`.

Изолированные интеграционные тесты требуют явно заданного `PLATFORMS_TEST_DATABASE_URL`; они создают и удаляют только собственные тестовые схемы:

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx --test tests/platform-requests-runtime.test.ts tests/platform-backfill-db.test.ts tests/public-platforms-db.test.ts
```

Отчёт CSV и воспроизведение initial mappings описаны в `platform-analysis.md`.
