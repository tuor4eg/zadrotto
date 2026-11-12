import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";
import { DEFAULT_TIER_CONFIGURATION, emptyTierDistribution, type TierDistribution, type TierLocalDraft } from "../src/lib/tier-lists/model";

const testUrl = process.env.TIER_LIST_TEST_DATABASE_URL;

test("tier-list action payload allowlists exclude descriptions", async () => {
  const actions = await readFile("src/app/tier-lists/actions.ts", "utf8");
  const allowlists = [...actions.matchAll(/validShape\(input,\s*\[([^\]]+)\]\)/g)];
  assert.equal(allowlists.length, 5, "all five public mutation actions use explicit field allowlists");
  for (const [, fields] of allowlists) assert.doesNotMatch(fields, /description/i);
  assert.match(actions, /Object\.keys\(value\)\.some\(key\s*=>\s*!allowed\.includes\(key\)\)/);
  assert.match(actions, /Buffer\.byteLength\(JSON\.stringify\(value\)/);
});

test("tier-list writes: isolated-schema quotas, snapshots, conflicts and event atomicity", { skip: !testUrl, timeout: 120000 }, async t => {
  const schema = `tier_lists_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = "isolated-tier-list-test-secret";
  let closeApp: (() => Promise<void>) | undefined;
  try {
    await client.unsafe(`create schema ${schema}`);
    for (const name of (await readdir("drizzle")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const migration = (await readFile(`drizzle/${name}`, "utf8"))
        .replaceAll('"public".', `"${schema}".`).replaceAll(/\bpublic\./g, `${schema}.`);
      await client.begin(async tx => { await tx.unsafe(migration); });
    }
    process.env.DATABASE_URL = url.toString();
    const service = await import("../src/db/queries/tier-lists");
    const { getDbClient } = await import("../src/db");
    closeApp = () => getDbClient().end({ timeout: 2 });
    const [profile] = await client`insert into author_access_profiles(code,name) values('tier-test','Tier test') returning id`;
    const [admin] = await client`insert into admin_users(login,password_hash) values('tier-test','unused') returning id`;
    const [mediaType] = await client`select id,code from media_types where is_publicly_available=true order by id limit 1`;
    assert.ok(mediaType, "baseline provides a public archive type");
    await client`insert into author_access_profile_media_types(access_profile_id,media_type_id) values(${profile.id},${mediaType.id}) on conflict do nothing`;
    const entries = await client`insert into media_items(code,title,media_type,publication_status)
      values('tier-test-first','Первая',${mediaType.code},'published'),('tier-test-second','Вторая',${mediaType.code},'published') returning id`;
    async function author() {
      return (await client`insert into authors(code,name,access_profile_id) values(${randomUUID()},'Тестовый автор',${profile.id}) returning id`)[0].id as number;
    }
    async function template() {
      return (await client`insert into tier_list_templates(name,configuration) values('Тестовый шаблон',${client.json(DEFAULT_TIER_CONFIGURATION)}) returning id`)[0].id as number;
    }
    const templateId = await template();
    async function limits(overrides: { maxDrafts?: number; maxPublished?: number; creationsPerDay?: number; publicationsPerDay?: number } = {}) {
      await service.saveTierListSettings({ maxEntries: 200, maxLevels: 10, maxDrafts: 10, maxPublished: 30, creationsPerDay: 20, publicationsPerDay: 5, ...overrides }, admin.id);
    }
    function distribution(): TierDistribution {
      return { ...emptyTierDistribution(DEFAULT_TIER_CONFIGURATION), s: [entries[0].id] };
    }
    async function create(owner: number, custom: Partial<{ templateId: number; distribution: TierDistribution; clientCreationId: string }> = {}) {
      return service.createTierList({ templateId, title: 'Тестовый тир-лист', clientCreationId: randomUUID(), distribution: distribution(), ...custom }, owner);
    }
    function code(error: unknown, expected: string) {
      return error instanceof service.TierListError && error.code === expected;
    }
    async function singleSuccess<T>(results: PromiseSettledResult<T>[], expectedCode: string) {
      const success = results.filter((row): row is PromiseFulfilledResult<T> => row.status === "fulfilled");
      const rejected = results.filter((row): row is PromiseRejectedResult => row.status === "rejected");
      assert.equal(success.length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(code(rejected[0].reason, expectedCode));
      return success[0].value;
    }

    await t.test("concurrent create enforces both draft and rolling creation limits", async () => {
      for (const settings of [{ maxDrafts: 1 }, { creationsPerDay: 1 }]) {
        await limits(settings);
        const owner = await author();
        await singleSuccess(await Promise.allSettled([create(owner), create(owner)]), 'quota');
        assert.equal((await client`select id from tier_lists where author_id=${owner}`).length, 1);
        assert.equal((await client`select id from tier_list_quota_events where author_id=${owner} and kind='created'`).length, 1);
      }
    });

    await t.test("concurrent publish enforces both count and rolling publication limits", async () => {
      for (const settings of [{ maxPublished: 1 }, { publicationsPerDay: 1 }]) {
        await limits(settings);
        const owner = await author();
        const lists = await Promise.all([create(owner), create(owner)]);
        await singleSuccess(await Promise.allSettled(lists.map(list => service.changeTierListStatus({ publicId: list.publicId, version: list.version, status: 'published' }, owner))), 'quota');
        assert.equal((await client`select id from tier_lists where author_id=${owner} and status='published'`).length, 1);
        assert.equal((await client`select id from tier_list_quota_events where author_id=${owner} and kind='published'`).length, 1);
      }
    });

    await t.test("concurrent creation replay preserves UUID and emits one minimal XP event", async () => {
      await limits();
      const owner = await author();
      const clientCreationId = randomUUID();
      const lists = await Promise.all([create(owner, { clientCreationId }), create(owner, { clientCreationId })]);
      assert.equal(lists[0].publicId, lists[1].publicId);
      assert.equal(lists[0].id, lists[1].id);
      const events = await client`select * from domain_events where type='tier-list.created' and aggregate_id=${String(lists[0].id)}`;
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].payload, { authorId: owner, tierListId: lists[0].id });
      assert.equal((await client`select * from domain_event_outbox where event_id=${events[0].id}`).length, 1);
      assert.equal((await client`select * from tier_list_quota_events where author_id=${owner}`).length, 1);
      await client`update tier_lists set description='Секретное описание' where id=${lists[0].id}`;
      const own = await service.getTierList(lists[0].publicId, owner, true);
      assert.ok(own);
      assert.ok(!('description' in own.document));
      assert.ok(!JSON.stringify(own.document).includes('Секретное описание'));
    });

    await t.test("an event insertion failure rolls back list, quota and outbox", async () => {
      const owner = await author();
      await client.unsafe(`create function ${schema}.reject_tier_event() returns trigger language plpgsql as $$
        begin if new.type='tier-list.created' then raise exception 'forced tier event failure'; end if; return new; end $$`);
      await client.unsafe(`create trigger reject_tier_event before insert on domain_events for each row execute function ${schema}.reject_tier_event()`);
      try {
        await assert.rejects(create(owner));
        assert.equal((await client`select * from tier_lists where author_id=${owner}`).length, 0);
        assert.equal((await client`select * from tier_list_quota_events where author_id=${owner}`).length, 0);
        assert.equal((await client`select * from domain_events where type='tier-list.created' and actor_author_id=${owner}`).length, 0);
      } finally {
        await client.unsafe('drop trigger reject_tier_event on domain_events');
        await client.unsafe(`drop function ${schema}.reject_tier_event()`);
      }
    });

    await t.test("a later save overwrites the list, while publication gaps and hidden publication are rejected", async () => {
      await limits();
      const owner = await author();
      const list = await create(owner);
      const published = await service.changeTierListStatus({ publicId: list.publicId, version: list.version, status: 'published' }, owner);
      const overwritten = await service.saveTierList({ publicId: list.publicId, version: list.version, title: 'Устарело', distribution: distribution() }, owner);
      assert.equal(overwritten.title, 'Устарело');
      const gap = { ...distribution(), b: [entries[1].id] };
      await assert.rejects(service.saveTierList({ publicId: list.publicId, version: published.version, title: 'Пустой A', distribution: gap }, owner), error => code(error, 'range'));
      const [before] = await client`select first_published_at from tier_lists where id=${list.id}`;
      const draft = await service.changeTierListStatus({ publicId: list.publicId, version: published.version, status: 'draft' }, owner);
      const republished = await service.changeTierListStatus({ publicId: list.publicId, version: draft.version, status: 'published' }, owner);
      assert.deepEqual((await client`select first_published_at from tier_lists where id=${list.id}`)[0], before);
      const hiddenDraft = await service.changeTierListStatus({ publicId: list.publicId, version: republished.version, status: 'draft' }, owner);
      await service.moderateTierList({ publicId: list.publicId, action: 'hide' }, admin.id);
      const current = await service.getTierList(list.publicId, owner, true);
      assert.ok(current);
      assert.ok(current.document.version > hiddenDraft.version);
      await assert.rejects(service.changeTierListStatus({ publicId: list.publicId, version: current.document.version, status: 'published' }, owner), error => code(error, 'hidden'));
      const gapDraft = await create(owner, { distribution: gap });
      await assert.rejects(service.changeTierListStatus({ publicId: gapDraft.publicId, version: gapDraft.version, status: 'published' }, owner), error => code(error, 'range'));
    });

    await t.test("admin creates an editorial publication, reassigns owner and keeps a single creation fact", async () => {
      await limits();
      const [editorial] = await client`insert into authors(code,name,is_system,access_profile_id) values('tier-editorial','Редакция',true,${profile.id}) returning id`;
      assert.equal((await service.getDefaultTierListAdminAuthor())?.id, editorial.id);
      assert.ok((await service.searchTierListAdminAuthors('Редак')).some(row=>row.id===editorial.id));
      const request = {clientCreationId:randomUUID(),authorId:editorial.id,templateId,title:'Редакционный список',distribution:distribution(),status:'published' as const};
      const created = await service.saveAdminTierList(request,admin.id);
      assert.equal(created.authorId,editorial.id);
      assert.ok(await service.getTierList(created.publicId));
      await assert.rejects(create(editorial.id),error=>code(error,'access'));
      const {getFeedPage} = await import('../src/db/queries/feed');
      const feed = await getFeedPage({publicOnly:true,mediaTypeCodes:[mediaType.code]});
      assert.equal(feed.items.find(row=>row.key===`tier-list-${created.id}`)?.actorName,'Редакция');
      const owner = await author();
      const moved = await service.saveAdminTierList({...request,publicId:created.publicId,version:created.version,authorId:owner,title:'Список автора'},admin.id);
      assert.equal(moved.publicId,created.publicId);
      assert.equal(moved.authorId,owner);
      assert.deepEqual(moved.configuration,created.configuration);
      const replay = await service.saveAdminTierList(request,admin.id);
      assert.equal(replay.id,created.id);
      assert.equal(replay.title,'Список автора');
      assert.equal((await client`select id from domain_events where type='tier-list.created' and aggregate_id=${String(created.id)}`).length,1);
      const rewritten = await service.saveAdminTierList({...request,publicId:moved.publicId,version:created.version,authorId:editorial.id,title:'Поверх старой версии'},admin.id);
      assert.equal(rewritten.authorId, editorial.id);
      assert.equal(rewritten.title, 'Поверх старой версии');
      await client`update tier_lists set hidden_at=now(),hidden_reason='Проверка' where id=${moved.id}`;
      const hidden = await service.saveAdminTierList({...request,publicId:moved.publicId,version:moved.version,authorId:owner,title:'Скрытый список'},admin.id);
      assert.ok(hidden.hiddenAt);
      assert.equal(await service.getTierList(hidden.publicId),null);
      await client`update authors set blocked_at=now() where id=${owner}`;
      assert.equal(await service.getTierListAdminAuthor(owner),null);
      assert.equal((await service.getTierListAdminAuthor(owner,true))?.id,owner);
      assert.ok(await service.getAdminTierList(hidden.publicId));
      const reassigned=await service.saveAdminTierList({...request,publicId:hidden.publicId,version:hidden.version,title:'Возвращён редакции',authorId:editorial.id},admin.id);
      assert.equal(reassigned.authorId,editorial.id);
      assert.equal(reassigned.publicId,hidden.publicId);
      assert.ok(reassigned.hiddenAt);

      const {db} = await import('../src/db');
      const {applyReputationEvent} = await import('../src/lib/reputation/service');
      await client`update level_settings set status='enabled' where id=1`;
      const [event] = await client`select * from domain_events where type='tier-list.created' and aggregate_id=${String(created.id)}`;
      await db.transaction(tx=>applyReputationEvent(tx,{id:event.id,type:'tier-list.created',actorAuthorId:null,aggregateType:'tier-list',aggregateId:String(created.id),schemaVersion:1,occurredAt:event.occurred_at,payload:{authorId:editorial.id,tierListId:created.id}}));
      assert.equal((await client`select id from author_action_ledger where author_id=${editorial.id}`).length,0);
    });

    await t.test("admin save rejects invalid publication atomically and prevents hidden republishing", async () => {
      await limits();
      const owner=await author();
      const request={clientCreationId:randomUUID(),authorId:owner,templateId,title:'Новый список',distribution:{...distribution(),b:[entries[1].id]},status:'published' as const};
      await assert.rejects(service.saveAdminTierList(request,admin.id),error=>code(error,'range'));
      assert.equal((await client`select id from tier_lists where author_id=${owner}`).length,0);
      assert.equal((await client`select id from tier_list_quota_events where author_id=${owner}`).length,0);
      const saved=await service.saveAdminTierList({...request,status:'draft'},admin.id);
      await client`update tier_lists set hidden_at=now() where id=${saved.id}`;
      await assert.rejects(service.saveAdminTierList({...request,publicId:saved.publicId,version:saved.version,distribution:distribution()},admin.id),error=>code(error,'hidden'));
      const cleared=await service.saveAdminTierList({...request,publicId:saved.publicId,version:saved.version,status:'draft',distribution:distribution()},admin.id);
      assert.ok(cleared.hiddenAt);
    });

    await t.test("unavailable IDs survive owner reads and are removed only by an explicit save", async () => {
      await limits();
      const owner = await author();
      const list = await create(owner);
      await client`update media_items set publication_status='private' where id=${entries[0].id}`;
      try {
        const loaded = await service.getTierList(list.publicId, owner, true);
        assert.ok(loaded);
        assert.deepEqual(loaded.document.distribution.s, [entries[0].id]);
        assert.deepEqual(loaded.document.unavailableIds, [entries[0].id]);
        await assert.rejects(service.saveTierList({publicId:list.publicId,version:list.version,title:'Новое название',distribution:loaded.document.distribution},owner), error => code(error,'unavailable'));
        const cleaned = await service.saveTierList({publicId:list.publicId,version:list.version,title:'После очистки',distribution:emptyTierDistribution(DEFAULT_TIER_CONFIGURATION)},owner);
        assert.deepEqual(cleaned.distribution.s, []);
      } finally { await client`update media_items set publication_status='published' where id=${entries[0].id}`; }
    });

    await t.test("preview jobs commit with publication; installs fence versions, merges and deleted lists", async () => {
      await limits();
      const previews = await import("../src/db/queries/tier-list-previews");
      const route = await import("../src/app/tier-list-previews/[...objectKey]/route");
      const owner = await author();
      const draft = await create(owner);
      const generateCount = async () => Number((await client`select count(*)::int as n from job_runs where type='tier-lists.preview-generate' and (payload->>'listId')::int=${draft.id}`)[0].n);
      assert.equal(await generateCount(), 0);
      const published = await service.changeTierListStatus({ publicId: draft.publicId, version: draft.version, status: 'published' }, owner);
      assert.equal(await generateCount(), 1);
      await service.changeTierListStatus({ publicId: draft.publicId, version: published.version, status: 'published' }, owner);
      assert.equal(await generateCount(), 1, 'idempotent publication does not enqueue another preview');
      await client`delete from job_runs where type='tier-lists.preview-generate' and (payload->>'listId')::int=${draft.id}`;
      const migration = await readFile('drizzle/0007_tier_list_previews.sql', 'utf8');
      await client.unsafe('INSERT INTO job_runs' + migration.split('INSERT INTO job_runs')[1]);
      assert.equal(await generateCount(), 1, 'migration backfills already published lists');
      const [run] = await client`select id from job_runs where type='tier-lists.preview-generate' and (payload->>'listId')::int=${draft.id}`;
      await assert.rejects(previews.installTierPreview(published, `tier-lists/previews/${draft.id}/${randomUUID()}.webp`, [entries[0].id], { runId: run.id, lockToken: randomUUID() }), /STALE_SNAPSHOT_JOB/);
      const key = () => `tier-lists/previews/${draft.id}/${randomUUID()}.webp`;
      const first = key();
      assert.equal(await previews.installTierPreview(published, first, [entries[0].id]), true);
      assert.equal(await previews.installTierPreview(published, key(), [entries[0].id]), false, 'duplicate workers cannot replace a ready preview');
      assert.equal((await previews.getPublishedTierPreviewSource(draft.id))!.version, published.version);
      const validResponse = await route.GET(new Request('http://localhost'), { params: Promise.resolve({ objectKey: first.split('/') }) });
      assert.equal(validResponse.status, 200);
      assert.equal(validResponse.headers.get('X-Accel-Redirect'), `/_tier-list-previews/${first}`);
      const updated = await service.saveTierList({ publicId: published.publicId, version: published.version, title: 'Изменённый', distribution: published.distribution }, owner);
      assert.equal(await generateCount(), 2);
      assert.equal((await route.GET(new Request('http://localhost'), { params: Promise.resolve({ objectKey: first.split('/') }) })).status, 404, 'old version is inaccessible immediately');
      assert.equal(await previews.installTierPreview(published, key(), [entries[0].id]), false);
      const second = key();
      assert.equal(await previews.installTierPreview(updated, second, [entries[0].id]), true);
      assert.ok((await client`select id from job_runs where type='tier-lists.preview-cleanup' and payload->>'objectKey'=${first}`).length);
      await client`update media_items set publication_status='private' where id=${entries[0].id}`;
      try {
        assert.equal((await route.GET(new Request('http://localhost'), { params: Promise.resolve({ objectKey: second.split('/') }) })).status, 404, 'removed records cannot leak through raster');
      } finally { await client`update media_items set publication_status='published' where id=${entries[0].id}`; }
      await service.moderateTierList({ publicId: updated.publicId, action: 'hide' }, admin.id);
      assert.equal(await previews.getPublishedTierPreviewSource(draft.id), null);
      assert.equal((await route.GET(new Request('http://localhost'), { params: Promise.resolve({ objectKey: second.split('/') }) })).status, 404);
      await service.moderateTierList({ publicId: updated.publicId, action: 'restore' }, admin.id);
      const restored = (await previews.getPublishedTierPreviewSource(draft.id))!;
      const target = await author();
      await client`update tier_lists set author_id=${target} where id=${draft.id}`;
      const beforeMergeRetry = await generateCount();
      assert.equal(await previews.installTierPreview(restored, key(), [entries[0].id]), false);
      assert.equal(await generateCount(), beforeMergeRetry + 1, 'in-flight owner transfer requeues generation');
      const moved = (await previews.getPublishedTierPreviewSource(draft.id))!;
      const third = key();
      assert.equal(await previews.installTierPreview(moved, third, [entries[0].id]), true);
      await service.deleteTierList({ publicId: moved.publicId, version: moved.version }, target);
      assert.equal(await previews.getPublishedTierPreviewSource(draft.id), null);
      assert.equal(await previews.isTierPreviewAssigned(third), false);
      assert.ok((await client`select id from job_runs where type='tier-lists.preview-cleanup' and payload->>'objectKey'=${third}`).length);
      assert.equal(await previews.installTierPreview(moved, key(), []), false);
    });

    await t.test("template edits and deletion preserve snapshots and local import survives source deletion", async () => {
      await limits();
      const owner = await author();
      const sourceId = await template();
      const list = await create(owner, { templateId: sourceId });
      const snapshot = structuredClone(list.configuration);
      const signedTemplate = (await service.getTierTemplates()).find(row => row.id === sourceId);
      assert.ok(signedTemplate);
      await service.saveTierTemplate({ id: sourceId, name: 'Изменён', isDefault: false,
        configuration: { schemaVersion: 1, levels: [{ id: 'new', name: 'Новый', color: '#ffffff' }] } }, admin.id);
      assert.deepEqual((await service.getTierList(list.publicId, owner, true))?.document.configuration, snapshot);
      await service.deleteTierTemplate(sourceId, admin.id);
      const retained = (await service.getTierList(list.publicId, owner, true))!.document;
      assert.equal(retained.templateId, null);
      assert.deepEqual(retained.configuration, snapshot);
      const local: TierLocalDraft = { schemaVersion: 1, clientCreationId: randomUUID(), title: 'Локальная копия',
        templateId: sourceId, snapshotToken: signedTemplate.snapshotToken, configuration: snapshot, distribution: distribution(), updatedAt: new Date().toISOString() };
      const forged = { ...local, configuration: { schemaVersion: 1 as const, levels: [{ id: "forged", name: "Подмена", color: "#ffffff" }] }, distribution: { forged: [entries[0].id] } };
      await assert.rejects(service.createTierList({ clientCreationId: forged.clientCreationId, title: forged.title, templateId: sourceId, distribution: forged.distribution }, owner, forged), error => code(error, "validation"));
      const imported = await service.createTierList({ clientCreationId: local.clientCreationId, title: local.title,
        templateId: sourceId, distribution: local.distribution }, owner, local);
      assert.equal(imported.templateId, null);
      assert.deepEqual(imported.configuration, snapshot);
      assert.deepEqual(imported.distribution, local.distribution);
    });
  } finally {
    await closeApp?.();
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end({ timeout: 2 });
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
