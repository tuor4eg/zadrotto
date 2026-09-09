# Security audit report — run 1

## Executive summary

До публичного запуска есть два обязательных блокера: обновить `next` и `sharp`. Установленные
версии входят в диапазоны актуальных advisories; Next.js непосредственно обслуживает публичные
Server Actions, а Sharp разбирает байты изображений, загружаемые обычными авторами. В прикладной
логике подтверждён ещё один LOW-риск: автор может без лимита создавать багрепорты и раздувать
уведомления/Telegram outbox. Обходов авторизации, IDOR, SQL injection, SSRF, XSS, prompt injection,
утечек секретов или слабого password-reset flow в проверенных путях не подтверждено.

Baseline: небольшой Letterboxd/Goodreads-подобный UGC-сервис с staff CMS. В сравнении с ним
основные auth/ownership-пути реализованы аккуратно, но dependency hygiene и abuse controls перед
открытой регистрацией пока недостаточны.

## Findings

| Severity | Title | Summary |
|---|---|---|
| HIGH | Next.js Server Action DoS | `16.2.4` затронута GHSA-m99w-x7hq-7vfj; публичный App Router/Server Action удовлетворяет условиям атаки. |
| HIGH | Уязвимая версия Sharp/libvips | `0.34.5` затронута memory-safety advisories; авторские изображения доходят до декодера. |
| LOW | Неограниченный fan-out багрепортов | Обычный автор может создавать неограниченное число reports/events/admin notifications и Telegram deliveries. |

## HIGH — уязвимая версия Next.js

- Location: `package.json:35`, `next.config.ts:4-7`, публичные Server Actions в `src/app/**/actions.ts`.
- Attack: удалённый клиент отправляет сформированный по GHSA-m99w-x7hq-7vfj App Router / Server
  Action запрос к публичной форме входа администратора на `next@16.2.4`. Точные байты не
  воспроизводились в этом source-аудите, но версия и все условия advisory подтверждены.
- Impact: excessive CPU и блокировка дальнейших запросов в процессе — отказ в обслуживании.
- Fix: обновить как минимум до версии, которую текущий audit считает исправленной (`16.3.4`),
  обновить lockfile, затем прогнать targeted auth/action tests, typecheck и повторный `npm audit`;
  `16.2.11` — минимальный fix только для этого advisory.

## HIGH — уязвимая версия Sharp/libvips

- Location: `package.json:36`; обычный автор загружает avatar/cover в
  `src/app/author/(protected)/profile/actions.ts:35-52` и
  `src/app/author/(protected)/media/actions.ts:476-535`; байты разбираются Sharp в
  `src/lib/avatars/storage.ts:61-100` и `src/lib/covers/storage.ts:94-103,203-224`.
- Attack: авторизованный автор загружает специально сформированное изображение допустимого размера
  и MIME; оно попадает в уязвимые native codecs Sharp/libvips.
- Impact: crash/DoS процесса; advisory для libheif/libvips описывает memory-safety defects, поэтому
  безопасно выкатывать затронутую native dependency нельзя.
- Fix: обновить Sharp до исправленной ветки (`0.35.4` по текущему npm audit), пересобрать image с
  чистым `npm ci`, проверить avatar/cover/quiz/collection/achievement pipelines и повторить audit.

## LOW — неограниченный fan-out багрепортов

- Location: `src/app/api/bug-reports/route.ts:52-98`, `src/db/queries/bug-reports.ts:35-50`,
  `src/lib/notifications/consumer.ts:23-84`.
- Attack: обычный автор циклически отправляет `POST /api/bug-reports` с
  `{"description":"x","url":"/"}` и своей session cookie.
- Impact: по одной строке bug report и domain event на запрос, уведомление каждому администратору и,
  если маршрут включён, Telegram delivery каждому получателю; устойчивый spam и рост таблиц/очередей.
- Fix: per-author и per-IP rate limit до транзакции, `429`, небольшой cooldown/deduplication и
  операционная квота на незакрытые reports.

## Hardening notes

- Зафиксировать и протестировать reverse-proxy contract: proxy должен удалять входной
  `X-Forwarded-For` и выставлять доверенный адрес. Иначе IP rate limits можно обходить; репозиторий
  содержит только loopback binding, поэтому эксплуатация из source не подтверждена.
- Добавить CSP (`frame-ancestors`, узкие `default-src`/`connect-src`/`img-src`) и стандартные
  security headers. Без XSS/clickjacking chain это defense-in-depth, не отдельная finding.
- Провалидировать production secrets на старте: запретить example/default значения и слишком
  короткие session/encryption keys.
- Ограничить размер запросов на reverse proxy ниже глобального Server Action лимита 6 MiB там, где
  большие uploads не нужны.
- Повторить динамический аудит уже развёрнутого proxy/CDN: cache keys, Host/X-Forwarded-* handling,
  TLS/HSTS, request smuggling и фактический IP rate-limit нельзя доказать только по этому repo.

## Positive patterns

- Author sessions — CSPRNG opaque tokens, hashed at rest, revocable and checked against blocked state.
- Admin HMAC token verifies signature, pinned algorithm, expiry and DB invalidation timestamp.
- Password reset tokens are strong, expiring, single-use and purpose-bound; reset revokes sessions.
- Cookies use HttpOnly/SameSite and production Secure; auth rate limits fail closed.
- Ownership is repeated in database predicates on examined review/media/friend/notification paths.
- React raw-HTML escape hatches are absent; AI output is reduced to validated candidate IDs.
- Provider image relay uses HTTPS host allowlists, forbids redirects/credentials/ports and bounds time/bytes.
- Production web container runs as a non-root user; app and Redis ports are loopback-bound.
