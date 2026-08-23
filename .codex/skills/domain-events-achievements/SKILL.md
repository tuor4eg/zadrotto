---
name: domain-events-achievements
description: Проектирование, реализация и ревью доменных событий, transactional outbox, event consumers и ачивок в zadrotto. Использовать при добавлении или изменении механики или витрины ачивок, domain event type или producer, consumer, dispatcher/recovery, achievement backfill, выдачи и toast-уведомлений. Не использовать для обычных jobs, не связанных с событиями или ачивками.
---

# Доменные события и ачивки

Соблюдать границы: `domain_events` хранит факт, outbox гарантирует доставку, immediate `job_run` ускоряет её, recovery страхует, consumer реагирует. Не вызывать проверку ачивок из бизнес-логики напрямую.

## Механика ачивки

1. Добавить code в `ACHIEVEMENT_MECHANIC_CODES` и definition в `src/lib/achievements/catalog.ts`.
2. Строго разобрать `params`; не вводить универсальный DSL.
3. Указать только `eventTypes`, после которых прогресс мог измениться.
4. Вычислять текущий прогресс через `evaluateBatch` по данным БД одним set-based запросом для всех `authorIds`; не хранить вычисляемый прогресс и не делать N+1.
5. Не менять producer события ради новой механики.

Если нужна конкретная преднастроенная ачивка, добавить отдельной миграцией `achievements` и её `achievement_levels` со стабильным code, русскими текстами, mechanic/params, порогами, `enabled` и `display_order`. Не изменять применённые миграции. Ачивки, создаваемые администратором через существующую форму, отдельной миграции не требуют.

Выдачу сохранять идемпотентной через уникальность `(author_id, achievement_level_id)` и `onConflictDoNothing`. Выданные уровни не отзывать; `enabled = false` запрещает только новые выдачи.

Для существующих авторов использовать `achievements.backfill`:

```json
{ "achievementIds": [42], "batchSize": 100 }
```

В первом запуске не задавать `awardGroupId`; continuation jobs обязаны передавать созданный group ID без изменений.

## Доменное событие

1. Добавить тип и минимальный безопасный payload в `src/lib/domain-events/catalog.ts`; не включать секреты и полный пользовательский текст.
2. Вызывать `appendEvent` в той же `runInDomainEventTransaction`, что и бизнес-изменение.
3. Создавать событие только при фактической вставке или переходе. Конкурентный переход защищать row lock либо условным `UPDATE ... RETURNING`.
4. Не enqueue-ить до commit. Ошибка best-effort immediate dispatch не должна откатывать бизнес-операцию.
5. Регистрировать реакцию как consumer, не связывать producer с конкретными потребителями.

`actorAuthorId` — инициатор, не обязательно субъект реакции; для административного действия допустим `null`. Субъекта брать из payload или aggregate.

## Доставка и внешние эффекты

- DB-consumer должен claim-ить `(event_id, consumer_key)` через conflict-do-nothing и выполнять DB-effects в той же транзакции.
- Outbox отмечать dispatched только после всех текущих consumers. Ошибка recovery-события не должна блокировать более новые события батча.
- Email, push и внешние API требуют собственной идемпотентности или отдельного outbox.
- Новый consumer не переигрывает dispatched-историю автоматически; для истории использовать consumer-specific backfill.

## Toast и проверка

Постоянная витрина — источник истины, toast допускает at-most-once. Pending-группу claim-ить атомарно, сразу ставить `announced_at`, а награды одной проверки объединять общим non-null `award_group_id`. Не poll-ить гостя или скрытую вкладку.

Проверить целевыми тестами атомарность business change/event, идемпотентность доставки и выдачи, корректный переход события, disabled-состояние, continuation backfill и конкурентный toast claim. Для схемы дополнительно использовать `data-boundaries`, для новой feature boundary — `project-structure`.
