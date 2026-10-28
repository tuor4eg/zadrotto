import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sql } from "drizzle-orm";

const testUrl = process.env.BGG_CREATORS_TEST_DATABASE_URL;

test("BGG creator identities, roles, moderation and public filtering persist through PostgreSQL", { skip: !testUrl }, async (t) => {
  const schema = `bgg_creators_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient, db } = await import("../src/db");
  const { mediaItems, mediaItemMetadata } = await import("../src/db/schema");
  const creators = await import("../src/db/queries/creators");
  const requests = await import("../src/db/queries/creator-requests");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм'),('boardgame','Настолка');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text);
      INSERT INTO media_items VALUES(1,'one','Один','boardgame','published'),(2,'two','Два','boardgame','published'),(3,'three','Три','boardgame','published'),(4,'four','Четыре','boardgame','draft'),(5,'five','Пять','boardgame','published');
      ALTER TABLE media_items ADD COLUMN original_title text,ADD COLUMN description text,ADD COLUMN media_carrier_id integer,ADD COLUMN release_year integer,
        ADD COLUMN cover_url text,ADD COLUMN cover_thumb_url text,ADD COLUMN cover_thumb_attempted_at timestamptz,ADD COLUMN metadata_attempted_at timestamptz,
        ADD COLUMN shikimori_enrichment_attempted_at timestamptz,ADD COLUMN metadata_issue_code text,ADD COLUMN cover_source_provider text,
        ADD COLUMN cover_source_external_id text,ADD COLUMN cover_source_page_url text,ADD COLUMN author_creation_request_id integer,
        ADD COLUMN created_by_author_id integer,ADD COLUMN moderation_revision integer,ADD COLUMN created_at timestamptz DEFAULT now(),
        ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN submitted_at timestamptz,ADD COLUMN reviewed_by_admin_id integer,
        ADD COLUMN reviewed_at timestamptz,ADD COLUMN admin_note text;
      CREATE TABLE franchises(id integer PRIMARY KEY,code text,title text,publication_status text);
      INSERT INTO franchises VALUES(1,'related','Связанная серия','published'),(2,'private','Скрытая серия','draft');
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id),facts jsonb NOT NULL DEFAULT '{}',source_provider text,
        source_external_id text,source_url text,fetched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE admin_activity_logs(id serial PRIMARY KEY,created_at timestamptz DEFAULT now(),actor_type text,admin_user_id integer,
        author_id integer,action text,entity_type text,entity_id integer,entity_label text,status text,severity text,message text,ip_address text,user_agent text,metadata jsonb);
      CREATE TABLE job_runs(id serial PRIMARY KEY,job_id integer,retry_of_run_id integer,created_by_admin_id integer,type text,payload jsonb DEFAULT '{}',
        source text,status text DEFAULT 'queued',scheduled_for timestamptz,available_at timestamptz,attempts integer DEFAULT 0,max_attempts integer,
        timeout_seconds integer,retry_base_seconds integer,retry_max_seconds integer,locked_at timestamptz,locked_by text,lock_token text,
        lock_expires_at timestamptz,started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql", "drizzle/0125_game_company_creators.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await client.unsafe(`ALTER TABLE creators ADD COLUMN birth_date date,ADD COLUMN death_date date,ADD COLUMN name_ru text,ADD COLUMN name_ru_source text,ADD COLUMN name_ru_processed boolean NOT NULL DEFAULT false`);
    await client.unsafe(`ALTER TABLE creator_request_media_items ADD COLUMN source_position integer; ALTER TABLE entry_creator_sources ADD COLUMN source_position integer; ALTER TABLE domain_event_outbox ADD COLUMN next_attempt_at timestamptz DEFAULT now()`);
    await client.unsafe(`CREATE TABLE provider_snapshot_links(id serial PRIMARY KEY,snapshot_id bigint,entity_type text,entity_id text,purpose text)`);
    const types = await creators.getCreatorTypes();
    const person = types.find(row => row.code === "person")!;
    const collective = types.find(row => row.code === "collective")!;
    const roles = await creators.getCreatorRoles();
    const designer = roles.find(row => row.code === "designer")!;
    const artist = roles.find(row => row.code === "artist")!;
    const ref = (externalId: string, name: string, roleCode: "designer" | "artist" = "designer") => ({ externalId, name, roleCode });
    const syncFacts = async (entryId: number, facts: Record<string, unknown>) => db.transaction(async tx => {
      await tx.insert(mediaItemMetadata).values({ mediaItemId: entryId, sourceProvider: "bgg", facts })
        .onConflictDoUpdate({ target: mediaItemMetadata.mediaItemId, set: { sourceProvider: "bgg", facts } });
      return requests.syncProviderCreators(tx, { mediaItemId: entryId, provider: "bgg", mediaType: "boardgame", facts });
    });
    const sync = (entryId: number, refs: ReturnType<typeof ref>[]) => syncFacts(entryId, { bggCreators: refs });
    const requestFor = async (id: string) => (await client`SELECT * FROM creator_requests WHERE provider='bgg' AND external_creator_id=${id}`)[0];
    const bindingFor = async (id: string) => (await client`SELECT * FROM provider_creator_bindings WHERE provider='bgg' AND external_creator_id=${id}`)[0];
    const apply = async (decision: { requestId: number; jobRunId: number }) => {
      await requests.applyCreatorRequest(decision.requestId, { jobRunId: decision.jobRunId });
      await client`UPDATE job_runs SET status='succeeded' WHERE id=${decision.jobRunId}`;
    };
    const sourceRoles = async (entryId: number, creatorId: number) => (await client`SELECT r.code FROM entry_creator_sources s JOIN creator_roles r ON r.id=s.role_id WHERE s.entry_id=${entryId} AND s.creator_id=${creatorId} AND s.provider='bgg' ORDER BY r.code`).map(row => row.code);
    let matchedId = 0;
    let groupId = 0;

    await t.test("exact normalized names await manual review before mapping both roles", async () => {
      const existing = await creators.createCreator({ name: "Ёж Иван", slug: "hedgehog", typeId: person.id });
      matchedId = existing.id;
      const result = await sync(1, [ref("101", "  ЕЖ   ИВАН "), ref("101", "еж Иван", "artist")]);
      assert.equal(result.createdCreators, 0);
      assert.equal(await bindingFor("101"), undefined);
      assert.equal((await requestFor("101")).decision, null);
      await assert.rejects(requests.resolveCreatorRequest({requestId:(await requestFor("101")).id,decision:"create",autoApprove:true}), (error:unknown)=>(error as {code?:string}).code==='auto-skip');
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor("101")).id,decision:"map",creatorId:existing.id,adminId:1}));
      assert.equal((await bindingFor("101")).creator_id, existing.id);
      assert.deepEqual(await sourceRoles(1, existing.id), ["artist", "designer"]);
      assert.equal((await client`SELECT count(*)::int n FROM creator_requests WHERE external_creator_id='101'`)[0].n, 1);
      const original = await creators.createCreator({ name: "Русское имя", originalName: "Original Designer", slug: "original-designer", typeId: person.id });
      await sync(2, [ref("102", " ORIGINAL   DESIGNER ")]);
      assert.equal(await bindingFor("102"), undefined);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor("102")).id,decision:"map",creatorId:original.id,adminId:1}));
      assert.equal((await bindingFor("102")).creator_id, original.id);
      await sync(1, [ref("101", "Renamed Designer"), ref("101", "Renamed Designer", "artist")]);
      await sync(1, [ref("101", "Renamed Designer"), ref("101", "Renamed Designer", "artist")]);
      assert.equal((await bindingFor("101")).creator_id, existing.id);
      assert.equal((await bindingFor("101")).external_creator_name, "Renamed Designer");
      assert.deepEqual(await sourceRoles(1, existing.id), ["artist", "designer"]);
      assert.equal((await client`SELECT count(*)::int n FROM entry_creators WHERE entry_id=1 AND creator_id=${existing.id}`)[0].n, 2);
      await assert.rejects(creators.updateCreator(existing.id, { name: existing.name, slug: existing.slug, typeId: collective.id }), /creator-type-in-use/);
      await sync(1, [ref("101", "Renamed Designer"), ref("101", "Renamed Designer", "artist")]);
      assert.equal((await client`SELECT type_id FROM creators WHERE id=${existing.id}`)[0].type_id, person.id);
      assert.equal((await bindingFor("101")).creator_id, existing.id);
      assert.deepEqual(await sourceRoles(1, existing.id), ["artist", "designer"]);
      await creators.updateCreator(existing.id, { name: existing.name, slug: existing.slug, typeId: person.id });
    });

    await t.test("unknown and ambiguous IDs create role-aware requests without creating Creator", async () => {
      await creators.createCreator({ name: "Ambiguous", slug: "ambiguous-a", typeId: person.id });
      await creators.createCreator({ name: "AMBIGUOUS", slug: "ambiguous-b", typeId: collective.id });
      const before = (await client`SELECT count(*)::int n FROM creators`)[0].n;
      await sync(3, [ref("201", "New Studio"), ref("201", "New Studio", "artist"), ref("202", "Ambiguous")]);
      await sync(4, [ref("201", "New Studio", "artist")]);
      assert.equal((await client`SELECT count(*)::int n FROM creators`)[0].n, before);
      assert.equal(await bindingFor("201"), undefined);
      assert.equal(await bindingFor("202"), undefined);
      const request = await requestFor("201");
      assert.equal((await client`SELECT count(*)::int n FROM creator_request_media_items WHERE request_id=${request.id}`)[0].n, 3);
      assert.equal((await client`SELECT count(*)::int n FROM creator_requests WHERE external_creator_id='201'`)[0].n, 1);
      assert.equal((await client`SELECT count(*)::int n FROM domain_events WHERE payload->>'requestId'=${String(request.id)}`)[0].n, 1);
      await assert.rejects(requests.resolveCreatorRequest({ requestId: request.id, adminId: 1, decision: "create", name: "Studio" }));
      await apply(await requests.resolveCreatorRequest({ requestId: request.id, adminId: 1, decision: "create", name: "Studio", typeCode: "collective" }));
      groupId = (await bindingFor("201")).creator_id;
      assert.deepEqual(await sourceRoles(3, groupId), ["artist", "designer"]);
      assert.deepEqual(await sourceRoles(4, groupId), ["artist"]);
      assert.equal((await client`SELECT type_id FROM creators WHERE id=${groupId}`)[0].type_id, collective.id);
      await apply(await requests.resolveCreatorRequest({ requestId: (await requestFor("202")).id, adminId: 1, decision: "map", creatorId: groupId, typeCode: "person" }));
      assert.equal((await client`SELECT type_id FROM creators WHERE id=${groupId}`)[0].type_id, collective.id, "mapping never changes the chosen Creator type");
    });

    await t.test("same name with different BGG IDs stays separately moderated", async () => {
      const existing = await creators.createCreator({ name: "Same Person", slug: "same-person", typeId: person.id });
      await sync(5, [ref("301", "Same Person"), ref("302", "Same Person")]);
      assert.equal(await bindingFor("301"), undefined);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor("301")).id,decision:"map",creatorId:existing.id,adminId:1}));
      assert.equal(await bindingFor("302"), undefined);
      const second = await requestFor("302");
      assert.equal(second.decision, null);
      assert.notEqual(second.id, (await requestFor("301")).id);
      await apply(await requests.resolveCreatorRequest({ requestId: second.id, adminId: 1, decision: "create", name: "Same Person", typeCode: "person" }));
      assert.notEqual((await bindingFor("302")).creator_id, existing.id);
    });

    await t.test("concurrent games sharing a new BGG ID queue one request before manual mapping", async () => {
      const existing = await creators.createCreator({ name: "Concurrent Designer", slug: "concurrent-designer", typeId: person.id });
      const refs = [ref("401", "Concurrent Designer"), ref("401", "Concurrent Designer", "artist")];
      let locked = 0;
      let release!: () => void;
      const bothLocked = new Promise<void>(resolve => { release = resolve; });
      const syncLocked = (entryId: number) => db.transaction(async tx => {
        await tx.execute(sql`select id from media_items where id=${entryId} for update`);
        if (++locked === 2) release();
        await bothLocked;
        await tx.insert(mediaItemMetadata).values({mediaItemId:entryId,sourceProvider:"bgg",facts:{bggCreators:refs}}).onConflictDoUpdate({target:mediaItemMetadata.mediaItemId,set:{sourceProvider:"bgg",facts:{bggCreators:refs}}});
        return requests.syncProviderCreators(tx, { mediaItemId: entryId, provider: "bgg", mediaType: "boardgame", facts: { bggCreators: refs } });
      });
      const eventsBefore = (await client`SELECT count(*)::int n FROM domain_events`)[0].n;
      await Promise.all([syncLocked(2), syncLocked(5)]);
      assert.equal(await bindingFor("401"), undefined);
      assert.equal((await client`SELECT count(*)::int n FROM domain_events`)[0].n, eventsBefore+1);
      assert.equal((await client`SELECT count(*)::int n FROM creator_request_media_items WHERE request_id=${(await requestFor("401")).id}`)[0].n, 4);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor("401")).id,decision:"map",creatorId:existing.id,adminId:1}));
      assert.equal((await client`SELECT count(*)::int n FROM provider_creator_bindings WHERE provider='bgg' AND external_creator_id='401'`)[0].n, 1);
      assert.equal((await bindingFor("401")).creator_id, existing.id);
      assert.equal((await client`SELECT count(*)::int n FROM creator_requests WHERE provider='bgg' AND external_creator_id='401'`)[0].n, 1);
      for (const entryId of [2, 5]) {
        assert.deepEqual(await sourceRoles(entryId, existing.id), ["artist", "designer"]);
        assert.equal((await client`SELECT count(*)::int n FROM entry_creators WHERE entry_id=${entryId} AND creator_id=${existing.id}`)[0].n, 2);
      }
      assert.equal((await client`SELECT count(*)::int n FROM domain_events`)[0].n, eventsBefore+1, "concurrent pending occurrences emit one moderation event");
      // Keep following pruning assertions focused on their original participants.
      await sync(2, []);
      await sync(5, []);
    });

    await t.test("legacy facts preserve sources; invalid complete roster rolls back all writes", async () => {
      const before = await client`SELECT * FROM entry_creator_sources WHERE entry_id=1 ORDER BY role_id`;
      await syncFacts(1, { authors: ["Legacy Name"], artists: ["Legacy Artist"] });
      assert.deepEqual(await client`SELECT * FROM entry_creator_sources WHERE entry_id=1 ORDER BY role_id`, before);
      await assert.rejects(syncFacts(1, { bggCreators: [ref("999", "Must not persist"), { externalId: "bad", name: "Broken", roleCode: "designer" }] }));
      assert.deepEqual(await client`SELECT * FROM entry_creator_sources WHERE entry_id=1 ORDER BY role_id`, before);
      assert.equal(await requestFor("999"), undefined);
      assert.deepEqual((await client`SELECT facts FROM media_item_metadata WHERE media_item_id=1`)[0].facts, { authors: ["Legacy Name"], artists: ["Legacy Artist"] });
    });

    await t.test("removed BGG roles and participants prune only their own provenance", async () => {
      await creators.setManualEntryCreators(1, [{ creatorId: matchedId, roleId: artist.id }]);
      await client`INSERT INTO entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) VALUES(1,${matchedId},${designer.id},'other-provider','kept')`;
      await sync(1, [ref("101", "Renamed Designer")]);
      assert.deepEqual(await sourceRoles(1, matchedId), ["designer"]);
      assert.equal((await creators.getEntryCreators(1)).find(row => row.roleCode === "artist")!.isManual, true);
      await sync(1, []);
      assert.deepEqual(await sourceRoles(1, matchedId), []);
      assert.deepEqual((await creators.getEntryCreators(1)).map(row => row.roleCode).sort(), ["artist", "designer"]);
      assert.equal((await client`SELECT count(*)::int n FROM creators WHERE id=${matchedId}`)[0].n, 1);
      await sync(2, []);
      assert.deepEqual(await creators.getEntryCreators(2), [], "provider-only relation is removed");
      assert.ok(await bindingFor("102"), "identity binding survives absence from a particular game");
      await sync(5, []);
      assert.deepEqual(await creators.getEntryCreators(5), []);
      assert.equal((await client`SELECT count(*)::int n FROM creators WHERE name='Same Person'`)[0].n, 2, "sync never deletes orphaned Creator");
    });

    await t.test("public collective catalog counts one game for two roles and creator filters match", async () => {
      const publicResult = await creators.getCreators({ publicOnly: true, q: "Studio" });
      assert.equal(publicResult.totalCount, 1);
      assert.equal(publicResult.items[0].typeCode, "collective");
      assert.equal((await client`select count(distinct ec.entry_id)::int n from entry_creators ec join media_items m on m.id=ec.entry_id where ec.creator_id=${groupId} and m.publication_status='published'`)[0].n, 1, "draft game and duplicate roles do not increase public count");
      const filtered = await db.select({ id: mediaItems.id }).from(mediaItems).where(creators.creatorCondition(groupId));
      assert.deepEqual(filtered.map(row => row.id).sort(), [3, 4]);
      await client`UPDATE media_types SET is_publicly_available=false WHERE code='boardgame'`;
      assert.equal((await creators.getCreators({ publicOnly: true, q: "Studio" })).totalCount, 0);
      await client`UPDATE media_types SET is_publicly_available=true WHERE code='boardgame'`;
    });

    await t.test("reopen and exclusion survive apply and future metadata sync without resurrection", async () => {
      const binding = await bindingFor("201");
      const reopened = await requests.reopenCreatorBinding({ bindingId: binding.id, adminId: 1 });
      await apply(reopened);
      assert.equal(await bindingFor("201"), undefined);
      assert.deepEqual(await sourceRoles(3, groupId), ["designer"], "other BGG ID remains assigned");
      assert.deepEqual(await sourceRoles(4, groupId), []);
      await sync(4, [ref("201", "Studio", "artist")]);
      assert.deepEqual(await sourceRoles(4, groupId), []);
      assert.equal(await bindingFor("201"), undefined, "a matching existing name must not undo manual reopen");
      await apply(await requests.resolveCreatorRequest({ requestId: reopened.requestId, adminId: 1, decision: "exclude" }));
      await sync(4, [ref("201", "Studio", "artist")]);
      assert.deepEqual(await sourceRoles(4, groupId), []);
      const [exclusion] = await client`SELECT id FROM provider_creator_exclusions WHERE external_creator_id='201'`;
      const returned = await requests.reopenCreatorExclusion({ exclusionId: exclusion.id, adminId: 1 });
      await apply(returned);
      await sync(4, [ref("201", "Studio", "artist")]);
      assert.equal(await bindingFor("201"), undefined, "reopening exclusion returns pending moderation, not automatic mapping");
      assert.equal((await client`SELECT count(*)::int n FROM creators WHERE id=${groupId}`)[0].n, 1, "moderation never deletes BGG Creator");
    });
    await t.test("confirmed IDs ignore role-specific spelling differences without guessing new identity", async () => {
      await sync(5, [ref("101", "Renamed Designer"), ref("101", "Alternate Artist Name", "artist")]);
      assert.deepEqual(await sourceRoles(5, matchedId), ["artist", "designer"]);
      await sync(5, [ref("901", "Ёж Иван"), ref("901", "Different Name", "artist")]);
      assert.equal(await bindingFor("901"), undefined, "contradictory new names require approval");
      assert.equal((await requestFor("901")).decision, null);
    });
    await t.test("one-off approval creates a person through the existing request and apply job", async () => {
      await sync(5, [ref("1001", "Automatically Approved Person"), ref("1001", "Automatically Approved Person", "artist")]);
      const pending = await requestFor("1001");
      assert.equal(pending.decision, null);
      assert.equal(await bindingFor("1001"), undefined);
      assert.deepEqual(await requests.autoApproveBggCreatorRequests(5), { approved: 1, skipped: 0 });
      const approved = await requestFor("1001");
      assert.equal(approved.decision, "create");
      assert.equal(approved.apply_status, "applying");
      const bound = await bindingFor("1001");
      assert.deepEqual(await sourceRoles(5, bound.creator_id), [], "links wait for the ordinary apply job");
      await apply({ requestId: approved.id, jobRunId: approved.job_run_id });
      assert.deepEqual(await sourceRoles(5, bound.creator_id), ["artist", "designer"]);
      const [created] = await client`SELECT t.code FROM creators c JOIN creator_types t ON t.id=c.type_id WHERE c.id=${bound.creator_id}`;
      assert.equal(created.code, "person");
      assert.deepEqual(await requests.autoApproveBggCreatorRequests(5), { approved: 0, skipped: 0 });
      const returned = await requests.reopenCreatorBinding({ bindingId: bound.id, adminId: 1 });
      await apply(returned);
      assert.deepEqual(await requests.autoApproveBggCreatorRequests(5), { approved: 0, skipped: 0 });
      assert.equal(await bindingFor("1001"), undefined, "automatic approval preserves manual reopen");
      assert.equal((await client`SELECT id FROM creators WHERE id=${bound.creator_id}`).length, 0, "returning the last BGG binding deletes its unlinked creator");
    });
    await t.test("public media type tabs count unique creators and scope counts and roles", async () => {
      await client`INSERT INTO media_items(id,code,title,media_type,publication_status) VALUES(6,'book-six','Книга','book','published')`;
      await client`INSERT INTO entry_creators(entry_id,creator_id,role_id,is_manual)
        SELECT 6,${groupId},id,true FROM creator_roles WHERE code='writer'`;
      const books = await creators.getPublicCreatorsPage({ mediaType: "book", page: 1, pageSize: 1000, searchQuery: "" });
      assert.equal(books.paginationTotalCount, 1);
      assert.equal(books.items[0].id, groupId);
      assert.equal(books.items[0].mediaItemsCount, 1);
      assert.deepEqual(books.items[0].roles.map(role => role.code), ["writer"]);
      const games = await creators.getPublicCreatorsPage({ mediaType: "boardgame", page: 1, pageSize: 1000, searchQuery: "" });
      const studio = games.items.find(row => row.id === groupId)!;
      assert.ok(studio);
      assert.ok(studio.roles.every(role => role.code !== "writer"));
      assert.equal((await creators.getPublicCreatorsPage({ mediaType: "film", page: 1, pageSize: 24, searchQuery: "" })).paginationTotalCount, 0);
      const tabs = await creators.getPublicCreatorMediaTypeTabs();
      assert.ok(tabs.every(tab => tab.creatorsCount > 0));
      assert.ok(!tabs.some(tab => tab.code === "film"));
      for (const tab of tabs) {
        const page = await creators.getPublicCreatorsPage({ mediaType: tab.code, page: 1, pageSize: 1000, searchQuery: "" });
        assert.equal(tab.creatorsCount, page.paginationTotalCount);
      }
      assert.ok(tabs.some(tab => tab.creatorsCount > 0));
      assert.deepEqual(tabs.map(tab => tab.creatorsCount), tabs.map(tab => tab.creatorsCount).sort((a, b) => b - a));
    });
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
