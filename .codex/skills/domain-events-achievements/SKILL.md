---
name: domain-events-achievements
description: Проектирование, реализация и ревью доменных событий, transactional outbox, event consumers и ачивок в zadrotto. Использовать при добавлении или изменении ачивки, условия или витрины ачивок, domain event type или producer, consumer, dispatcher/recovery, achievement backfill, выдачи и toast-уведомлений об ачивках. Не использовать для обычных фоновых jobs, не связанных с доменными событиями или ачивками.
---

# Доменные события и ачивки

Соблюдать разделение ответственности:

- `domain_events` — факт;
- outbox — гарантия доставки;
- immediate `job_run` — ускоритель;
- scheduled recovery — страховка;
- consumer — реакция на факт.

Не вызывать проверку ачивок из бизнес-логики напрямую.

## Добавление ачивки

1. Добавить запись `achievements` отдельной SQL-миграцией: стабильный уникальный `code`, русские `name` и `description`, `enabled`, `display_order`. Не изменять старую применённую миграцию.
2. Добавить code в `ACHIEVEMENT_CODES` и определение в `src/lib/achievements/catalog.ts`.
3. Указать только события, после которых состояние могло стать выполненным. Условие проверять по текущим данным БД, не хранить вычисляемый прогресс.
4. Если текущего `AchievementEvaluationContext` недостаточно, расширить контекст и set-based запросы в `src/lib/achievements/service.ts`. Не вводить универсальный DSL и не делать N+1 запросы по авторам.
5. Сохранить идемпотентную выдачу через уникальность `(author_id, achievement_id)` и conflict-do-nothing. Выданные ачивки не отзывать. `enabled = false` запрещает только новые выдачи.
6. Для существующих авторов запустить разовый job `achievements.backfill` с payload:

```json
{
  "achievementCodes": ["new-code"],
  "batchSize": 100
}
```

Не задавать `awardGroupId` в первом запуске. Continuation jobs обязаны передавать созданный group ID без изменений.

## Добавление или изменение события

1. Добавить тип и безопасный минимальный payload в `src/lib/domain-events/catalog.ts`. Не класть секреты и полный пользовательский текст.
2. Породить событие через `appendEvent` внутри той же DB-транзакции, что и бизнес-изменение. Если операция ещё не транзакционная, перенести её в `runInDomainEventTransaction`.
3. Создавать событие только при реальном переходе состояния или вставке. Для конкурентных переходов использовать row lock или условный `UPDATE ... RETURNING`; предварительный unlocked `SELECT` недостаточен.
4. Не enqueue-ить job до commit. После commit инфраструктурная обёртка best-effort создаёт immediate dispatch; его ошибка не должна откатывать бизнес-операцию.
5. Добавить consumer в registry, не менять producer ради нового consumer.

`actorAuthorId` — инициатор, а не обязательно субъект реакции. Допускать `null` для административных действий; субъект определять из payload или запросом к aggregate.

## Consumers и внешние эффекты

- В транзакционном DB-consumer сначала claim consumption через `INSERT ... ON CONFLICT DO NOTHING RETURNING`, затем выполнить DB-effects в той же транзакции.
- Отмечать outbox dispatched только после успешной обработки всех текущих consumers.
- Ошибка одного recovery-event не должна блокировать более новые события батча; неисправное событие оставить pending для retry и залогировать.
- Email, push и внешние API не считать атомарными с consumption. Для них использовать собственную идемпотентность или отдельный transactional outbox.
- Новый consumer не переигрывает уже dispatched историю автоматически; для истории делать consumer-specific backfill.

## Toast и витрина

- Постоянная витрина — источник истины; toast допускает at-most-once.
- Pending-группу claim-ить атомарно и сразу ставить `announced_at`.
- Все награды одной проверки объединять общим non-null `award_group_id`.
- Не строить ack-протокол ради потерянного ответа toast.
- Не poll-ить гостя или скрытую вкладку. Для авторизованной активной вкладки использовать текущий интервал, немедленную проверку при навигации и focus.

## Проверка

Проверить минимум:

- rollback не оставляет business change без event/outbox и наоборот;
- повторная и конкурентная доставка не дублирует consumption и award;
- событие создаётся только на нужном переходе;
- условия учитывают только требуемые опубликованные данные;
- disabled-ачивка не выдаётся, уже выданная остаётся видимой;
- backfill сохраняет один group ID во всех continuation;
- toast claim конкурентно безопасен, guest/hidden polling отсутствует;
- миграция, typecheck, targeted lint и релевантные тесты проходят.

Для изменений схемы дополнительно использовать `data-boundaries`; для новых feature boundaries или перестройки registry — `project-structure`.
