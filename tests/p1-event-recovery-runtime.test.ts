import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import test from "node:test";

test("P1 event recovery: durable backoff, concurrency, crash, rollback and diagnostics", {
  skip: !process.env.P1_TEST_DATABASE_URL,
}, async t => {
  const { default: postgres } = await import("postgres");
  const admin = postgres(process.env.P1_TEST_DATABASE_URL!, {max: 1});
  const schema = `p1_events_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(process.env.P1_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "6";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  const { sql } = await import("drizzle-orm");
  const { domainEventConsumerRegistry } = await import("../src/lib/domain-events/registry");
  const originalConsumers = domainEventConsumerRegistry.forType;
  try {
    await client.unsafe(`
      create table domain_events(id uuid primary key,type text not null,schema_version int default 1,
        actor_author_id int,aggregate_type text default 'rating',aggregate_id text default 'test',payload jsonb default '{}',occurred_at timestamptz default now());
      create table domain_event_outbox(event_id uuid primary key references domain_events(id),dispatched_at timestamptz,
        next_attempt_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());
      create index domain_event_outbox_pending_idx on domain_event_outbox(next_attempt_at,event_id) where dispatched_at is null;
      create table domain_event_consumptions(event_id uuid references domain_events(id),consumer_key text,processed_at timestamptz default now(),primary key(event_id,consumer_key));
      create table p1_effects(event_id uuid primary key, hits int default 1);
      create table job_runs(id int primary key,status text,lock_token text,lock_expires_at timestamptz);
      create table admin_activity_logs(id serial primary key,action text,actor_type text,admin_user_id int,author_id int,
        entity_type text,entity_id int,entity_label text,status text,severity text,message text,ip_address text,user_agent text,
        metadata jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    `);
    const { dispatchDomainEvent, recoverPendingDomainEvents } = await import("../src/lib/domain-events/dispatcher");
    const insert = async (type = "rating.created", due = true) => {
      const id = randomUUID();
      await client`insert into domain_events(id,type) values(${id},${type})`;
      await client`insert into domain_event_outbox(event_id,next_attempt_at) values(${id},clock_timestamp()+${due ? "-1 hour" : "1 hour"}::interval)`;
      return id;
    };
    const healthy = {key:"test.effect", eventTypes:["rating.created" as const], async handle(tx: import("../src/db/transaction").DbTransaction, event: {id: string}) {
      await tx.execute(sql`insert into p1_effects(event_id) values(${event.id})`);
    }};
    domainEventConsumerRegistry.forType = () => [healthy];

    await t.test("duplicates serialize, delivered side effects are not repeated", async () => {
      const id = await insert();
      const results = await Promise.all([dispatchDomainEvent(id), dispatchDomainEvent(id)]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await client`select * from p1_effects where event_id=${id}`).length, 1);
      assert.equal(await dispatchDomainEvent(id), false);
    });
    await t.test("full poison window yields to newer healthy events; failures are visible", async () => {
      for (let i=0; i<60; i++) await insert("unsupported.poison");
      // Stable due order guarantees the first window contains only old poison.
      await client`update domain_event_outbox set next_attempt_at=clock_timestamp()-interval '2 hours' where dispatched_at is null`;
      const good = await insert();
      const first = await recoverPendingDomainEvents(50);
      assert.equal(first.failed, 50);
      const second = await recoverPendingDomainEvents(50);
      assert.equal(second.failed, 10);
      assert.equal(second.dispatched, 1);
      assert.equal((await client`select * from p1_effects where event_id=${good}`).length, 1);
      const logs = await client`select status,severity,metadata from admin_activity_logs where action='domain-event.dispatch.failed'`;
      assert.equal(logs.length, 60);
      assert.ok(logs.every(row => row.status === "failure" && row.severity === "warning" && row.metadata.eventId && !row.metadata.payload));
    });
    await t.test("consumer rollback preserves pending and removes effects/consumptions", async () => {
      const id = await insert();
      domainEventConsumerRegistry.forType = () => [healthy, {key:"test.fail",eventTypes:["rating.created"],async handle(){ throw new Error("private SQL password must not be logged"); }}];
      await assert.rejects(dispatchDomainEvent(id), {code:"event-delivery-failed"});
      assert.equal((await client`select * from p1_effects where event_id=${id}`).length, 0);
      assert.equal((await client`select * from domain_event_consumptions where event_id=${id}`).length, 0);
      const [row] = await client`select dispatched_at,next_attempt_at>clock_timestamp() as postponed from domain_event_outbox where event_id=${id}`;
      assert.equal(row.dispatched_at, null); assert.equal(row.postponed,true);
      const [log] = await client`select metadata,message from admin_activity_logs where metadata->>'eventId'=${id}`;
      assert.doesNotMatch(JSON.stringify(log), /password|private SQL/);
      domainEventConsumerRegistry.forType = () => [healthy];
      await client`update domain_event_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where event_id=${id}`;
      assert.equal(await dispatchDomainEvent(id), true);
    });
    await t.test("process death inside consumers leaves durable cooldown and no effects", async () => {
      const id = await insert();
      const child = spawn(process.execPath, ["--import","tsx","--conditions=react-server","tests/fixtures/p1-event-crash.ts",id], {
        cwd: process.cwd(), env: {...process.env,DATABASE_URL:url.toString()}, stdio:["ignore","pipe","pipe"],
      });
      let errors=""; child.stderr.on("data", chunk => {errors+=String(chunk);});
      const [code] = await once(child,"exit");
      assert.equal(code,77,errors);
      const [row] = await client`select dispatched_at,next_attempt_at>clock_timestamp() as postponed from domain_event_outbox where event_id=${id}`;
      assert.equal(row.dispatched_at,null); assert.equal(row.postponed,true);
      assert.equal((await client`select * from domain_event_consumptions where event_id=${id}`).length,0);
    });
    await t.test("rotated job token cannot admit or commit a domain event", async () => {
      const id = await insert();
      await client`insert into job_runs values(1,'running','new',clock_timestamp()+interval '10 minutes')`;
      await assert.rejects(dispatchDomainEvent(id,{jobGuard:{runId:1,lockToken:"old"}}), /STALE_SNAPSHOT_JOB/);
      assert.equal((await client`select * from p1_effects where event_id=${id}`).length,0);
    });
    await t.test("representative due selection avoids scanning dispatched and future backlog", async () => {
      await client.unsafe(`
        insert into domain_events(id,type) select gen_random_uuid(),'rating.created' from generate_series(1,200000);
        insert into domain_event_outbox(event_id,dispatched_at,next_attempt_at)
          select id,case when n<=150000 then now() end,case when n<=150000 then now() else now()+interval '1 day' end
          from (select id,row_number() over() n from domain_events where id not in(select event_id from domain_event_outbox))s;
        analyze domain_event_outbox;
      `);
      const plans: Record<string,unknown> = {};
      for (const [name,expr] of [["due","statement_timestamp()"],["absent","statement_timestamp()-interval '1 year'"],["common","statement_timestamp()+interval '2 days'"]]) {
        plans[name] = await client.unsafe(`explain(analyze,buffers,format json) select event_id from domain_event_outbox where dispatched_at is null and next_attempt_at<=${expr} order by next_attempt_at,event_id limit 50`);
      }
      await writeFile("/tmp/p1-events-performance.json",JSON.stringify(plans,null,2));
      assert.match(JSON.stringify(plans),/domain_event_outbox_pending_idx/);
      assert.doesNotMatch(JSON.stringify(plans),/Seq Scan/);
    });
  } finally {
    domainEventConsumerRegistry.forType=originalConsumers;
    await client.end({timeout:1});
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end({timeout:1});
  }
});
