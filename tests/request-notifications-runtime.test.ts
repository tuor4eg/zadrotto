import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"

import type { PersistedDomainEvent } from "../src/lib/domain-events/catalog"

const testUrl = process.env.CREATORS_TEST_DATABASE_URL

test("request notifications enqueue Telegram independently of admin recipients", { skip: !testUrl }, async () => {
  const schema = `request_notifications_${Date.now()}`
  const url = new URL(testUrl!)
  url.searchParams.set("options", `-c search_path=${schema}`)
  process.env.DATABASE_URL = url.toString()
  const { getDbClient, getDb } = await import("../src/db")
  const { notificationDomainEventConsumer } = await import("../src/lib/notifications/consumer")
  const { resolveNotificationDraft } = await import("../src/lib/notifications/draft")
  const client = getDbClient()
  const db = getDb()
  const event = (type: PersistedDomainEvent["type"], payload: PersistedDomainEvent["payload"]): PersistedDomainEvent => ({
    id: randomUUID(), actorAuthorId: null, aggregateType: "request", aggregateId: "1",
    occurredAt: new Date(), schemaVersion: 1, type, payload,
  })
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`)
    await client.unsafe(`
      CREATE TABLE admin_users(id integer PRIMARY KEY);
      CREATE TABLE authors(id integer PRIMARY KEY, name text);
      CREATE TABLE platform_requests(id integer PRIMARY KEY, external_platform_name text);
      CREATE TABLE genre_requests(id integer PRIMARY KEY, external_genre_name text);
      CREATE TABLE creator_requests(id integer PRIMARY KEY, external_creator_name text);
      CREATE TABLE notification_transport_routes(code text PRIMARY KEY, transport_codes jsonb);
      CREATE TABLE notification_transport_settings(code text PRIMARY KEY, chat_ids jsonb);
      CREATE TABLE notifications(
        id serial PRIMARY KEY, recipient_type text, recipient_id integer, type text,
        title text, body text, entity_type text, entity_id text, read_at timestamptz,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE notification_transport_outbox(
        event_id uuid, transport text, recipient text, status text DEFAULT 'pending',
        attempts integer DEFAULT 0, next_attempt_at timestamptz DEFAULT now(),
        lease_token uuid, lease_expires_at timestamptz, delivered_at timestamptz,
        last_error text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        PRIMARY KEY(event_id, transport, recipient)
      );
      INSERT INTO authors VALUES (1, 'Новый автор');
      INSERT INTO platform_requests VALUES (1, 'Новая платформа');
      INSERT INTO genre_requests VALUES (1, 'Новый жанр');
      INSERT INTO creator_requests VALUES (1, 'Новый создатель');
      INSERT INTO notification_transport_routes VALUES ('submission_created', '["telegram"]');
      INSERT INTO notification_transport_settings VALUES ('telegram', '["100", "200"]');
    `)
    const cases = [
      { event: event("platform-request.created", { requestId: 1 }), body: "Новая платформа" },
      { event: event("genre-request.created", { requestId: 1 }), body: "Новый жанр" },
      { event: event("creator-request.created", { requestId: 1 }), body: "Новый создатель" },
      { event: event("author.registration.submitted", { authorId: 1 }), body: "Новый автор" },
    ]
    for (const item of cases) {
      await db.transaction(async (tx) => {
        assert.equal((await resolveNotificationDraft(tx, item.event))?.body, item.body)
        await notificationDomainEventConsumer.handle(tx, item.event)
        await notificationDomainEventConsumer.handle(tx, item.event)
      })
      const rows = await client`SELECT recipient, transport FROM notification_transport_outbox WHERE event_id=${item.event.id} ORDER BY recipient`
      assert.deepEqual(Array.from(rows), [
        { recipient: "100", transport: "telegram" }, { recipient: "200", transport: "telegram" },
      ])
    }
    assert.equal(Number((await client`SELECT count(*) FROM notifications`)[0].count), 0)

    await client`INSERT INTO admin_users VALUES (7)`
    await client`UPDATE notification_transport_routes SET transport_codes='[]'::jsonb`
    const inboxOnly = event("creator-request.created", { requestId: 1 })
    await db.transaction((tx) => notificationDomainEventConsumer.handle(tx, inboxOnly))
    const inbox = await client`SELECT recipient_type, recipient_id, body FROM notifications`
    assert.deepEqual(Array.from(inbox), [{ recipient_type: "admin", recipient_id: 7, body: "Новый создатель" }])
    assert.equal(Number((await client`SELECT count(*) FROM notification_transport_outbox WHERE event_id=${inboxOnly.id}`)[0].count), 0)

    const missing = event("genre-request.created", { requestId: 999 })
    await db.transaction(async (tx) => {
      assert.equal(await resolveNotificationDraft(tx, missing), null)
      await notificationDomainEventConsumer.handle(tx, missing)
    })
    assert.equal(Number((await client`SELECT count(*) FROM notifications`)[0].count), 1)
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  }
})
