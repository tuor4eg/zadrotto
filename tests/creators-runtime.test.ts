import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { eq } from "drizzle-orm";

const testUrl = process.env.CREATORS_TEST_DATABASE_URL ?? process.env.GENRES_TEST_DATABASE_URL;

test("creator approval, provenance, backfill and stable codes persist through real PostgreSQL", { skip: !testUrl }, async () => {
  const schema = `creators_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient, db } = await import("../src/db");
  const { mediaItems } = await import("../src/db/schema");
  const creators = await import("../src/db/queries/creators");
  const requests = await import("../src/db/queries/creator-requests");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text);
      INSERT INTO media_items VALUES(1,'one','Один','book','published'),(2,'two','Два','book','draft'),(3,'three','Три','book','published'),(4,'four','Четыре','film','published'),(5,'five','Пять','book','published');
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
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const person = (await creators.getCreatorTypes()).find(row => row.code === "person")!;
    const writer = (await creators.getCreatorRoles()).find(row => row.code === "writer")!;
    assert.ok(person && writer);
    await assert.rejects(creators.updateCreatorType(person.id, { name: "Личность", code: "renamed" }));
    await assert.rejects(creators.updateCreatorRole(writer.id, { name: "Автор", code: "renamed" }));
    await assert.rejects(client`UPDATE creator_types SET code='renamed' WHERE id=${person.id}`);
    await assert.rejects(client`UPDATE creator_roles SET code='renamed' WHERE id=${writer.id}`);

    const sync = async (entryId: number, authors: unknown, provider = "google-books") => {
      const facts = { authors };
      await client`INSERT INTO media_item_metadata(media_item_id,source_provider,facts) VALUES(${entryId},${provider},${JSON.stringify(facts)}::jsonb)
        ON CONFLICT(media_item_id) DO UPDATE SET source_provider=EXCLUDED.source_provider,facts=EXCLUDED.facts`;
      await db.transaction(tx => requests.syncProviderCreators(tx, { mediaItemId: entryId, provider, mediaType: "book", facts }));
    };
    await sync(1, ["  Ёж   Иван  ", "еж Иван"]);
    await sync(2, ["ЕЖ Иван"]);
    assert.equal((await client`SELECT count(*)::int n FROM domain_events WHERE type='creator-request.created'`)[0].n, 1, "repeated provider occurrences notify only for a new request");
    assert.equal((await client`SELECT count(*)::int n FROM domain_event_outbox`)[0].n, 1);
    assert.equal((await client`SELECT count(*)::int n FROM job_runs WHERE type='domain-events.dispatch'`)[0].n, 1);
    await assert.rejects(db.transaction(async tx => {
      await requests.syncProviderCreators(tx, { mediaItemId: 3, provider: "google-books", mediaType: "book", facts: { authors: ["Rolled back author"] } });
      throw new Error("rollback");
    }));
    assert.equal((await client`SELECT count(*)::int n FROM domain_events`)[0].n, 1, "rollback removes both request and notification event");
    assert.equal((await client`SELECT count(*)::int n FROM creator_requests WHERE normalized_external_creator_name='rolled back author'`)[0].n, 0);

    let request = (await requests.getCreatorRequests())[0];
    const resolved = await requests.resolveCreatorRequest({ requestId: request.id, adminId: 1, decision: "create", name: "Ёж Иван" });
    await assert.rejects(requests.resolveCreatorRequest({ requestId: request.id, adminId: 1, decision: "exclude" }));
    await requests.applyCreatorRequest(request.id, { jobRunId: resolved.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${resolved.jobRunId}`;
    const creator = (await creators.getEntryCreators(1))[0];
    const collective = (await creators.getCreatorTypes()).find(row => row.code === "collective")!;
    const mappingsBeforeTypeChange = await client`SELECT id FROM provider_creator_mappings WHERE creator_id=${creator.id} ORDER BY id`;
    await creators.updateCreator(creator.id, { name: creator.name, slug: creator.slug, typeId: collective.id });
    assert.equal((await creators.getEntryCreators(1))[0].typeCode, "collective");
    assert.deepEqual(await client`SELECT id FROM provider_creator_mappings WHERE creator_id=${creator.id} ORDER BY id`, mappingsBeforeTypeChange);
    await creators.updateCreator(creator.id, { name: creator.name, slug: creator.slug, typeId: person.id });
    assert.equal((await creators.getEntryCreators(2))[0].id, creator.id);
    assert.deepEqual((await db.select({ id: mediaItems.id }).from(mediaItems).where(creators.creatorWriterCondition(creator.id))).map(row => row.id).sort(), [1, 2]);
    const hydrated = await db.select({ id: mediaItems.id, writers: creators.entryWriterCreatorsJsonSql() }).from(mediaItems);
    assert.equal(hydrated.find(row => row.id === 1)!.writers[0].id, creator.id);
    assert.deepEqual(hydrated.find(row => row.id === 3)!.writers, []);
    await creators.setManualEntryCreators(1, [{ creatorId: creator.id, roleId: writer.id }]);
    await sync(1, []);
    assert.equal((await creators.getEntryCreators(1))[0].isManual, true);
    await creators.setManualEntryCreators(1, []);
    assert.deepEqual(await creators.getEntryCreators(1), []);
    await sync(1, ["Еж Иван", "Alias"]);
    request = (await requests.getCreatorRequests()).find(row => row.normalizedExternalCreatorName === "alias")!;
    const alias = await requests.resolveCreatorRequest({ requestId: request.id, adminId: 1, decision: "map", creatorId: creator.id });
    await requests.applyCreatorRequest(request.id, { jobRunId: alias.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${alias.jobRunId}`;
    assert.equal((await creators.getEntryCreators(1)).length, 1);
    const mapping = (await client`SELECT id FROM provider_creator_mappings WHERE normalized_external_creator_name='alias'`)[0];
    const reopened = await requests.reopenCreatorMapping({ mappingId: mapping.id, adminId: 1 });
    await requests.applyCreatorRequest(request.id, { jobRunId: reopened.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${reopened.jobRunId}`;
    assert.equal((await creators.getEntryCreators(1))[0].id, creator.id, "another mapped provider value preserves the relation");
    await sync(1, ["Alias"]);
    assert.deepEqual(await creators.getEntryCreators(1), []);

    await sync(3, ["Ignored"]);
    request = (await requests.getCreatorRequests()).find(row => row.normalizedExternalCreatorName === "ignored")!;
    const excluded = await requests.resolveCreatorRequest({ requestId: request.id, adminId: 1, decision: "exclude" });
    await client`UPDATE job_runs SET status='failed',error_message='test failure' WHERE id=${excluded.jobRunId}`;
    const retry = await requests.retryCreatorRequest({ requestId: request.id, adminId: 1 });
    assert.deepEqual(await requests.applyCreatorRequest(request.id, { jobRunId: excluded.jobRunId }), { processed: 0 });
    assert.equal((await client`SELECT count(*)::int n FROM provider_creator_exclusions`)[0].n, 1);
    await requests.applyCreatorRequest(request.id, { jobRunId: retry.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${retry.jobRunId}`;
    assert.deepEqual(await creators.getEntryCreators(3), []);
    await sync(5, ["Еж Иван"], "open-library");
    await requests.backfillCreators();
    assert.equal((await creators.getEntryCreators(5))[0].id, creator.id, "backfill reuses normalized names across providers");
    assert.deepEqual(await creators.getEntryCreators(1), [], "backfill preserves explicitly reopened mapping");
    assert.deepEqual(await creators.getEntryCreators(3), [], "backfill preserves exclusion");
    const count = (await client`SELECT count(*)::int n FROM entry_creators`)[0].n;
    await requests.backfillCreators();
    assert.equal((await client`SELECT count(*)::int n FROM entry_creators`)[0].n, count);
    await assert.rejects(creators.deleteCreatorType(person.id));
    await assert.rejects(creators.deleteCreatorRole(writer.id));
    await assert.rejects(creators.deleteCreator(creator.id));
    await creators.updateCreator(creator.id, { name: "Ёж Иван", slug: creator.slug, typeId: person.id, seriesIds: [1, 2] });
    assert.deepEqual((await creators.getCreatorBySlug(creator.slug))!.series.map(row => row.code), ["related"]);
    assert.equal((await creators.getCreators({ publicOnly: true, q: "ЕЖ" })).totalCount, 1);
    await client`UPDATE media_items SET publication_status='draft' WHERE id=5`;
    assert.equal((await creators.getCreators({ publicOnly: true })).totalCount, 0, "draft-only writer is not listed");
    await client`UPDATE media_items SET publication_status='published' WHERE id=5`;
    await creators.createCreator({ name: "Ambiguous", slug: "ambiguous-one", typeId: person.id });
    await creators.createCreator({ name: "AMBIGUOUS", slug: "ambiguous-two", typeId: person.id });
    await sync(3, ["Ambiguous"]);
    const ambiguous = await requests.backfillCreators();
    assert.equal(ambiguous.errors.length, 0);
    assert.deepEqual(await creators.getEntryCreators(3), []);
    assert.ok((await requests.getCreatorRequests()).some(row => row.normalizedExternalCreatorName === "ambiguous"));
    await client`UPDATE media_item_metadata SET facts='{"authors":["Valid",42]}'::jsonb WHERE media_item_id=3`;
    const malformed = await requests.backfillCreators();
    assert.deepEqual(malformed.errors.map(row => row.entryId), [3]);
    await sync(3, ["Concurrent new"]);
    const concurrent = await Promise.all([requests.backfillCreators(), requests.backfillCreators()]);
    assert.equal(concurrent.reduce((sum, row) => sum + row.createdCreators, 0), 1);
    assert.equal(concurrent.reduce((sum, row) => sum + row.createdMappings, 0), 1);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(requests.backfillCreators(cancelled.signal));
    await client`UPDATE media_types SET is_publicly_available=false WHERE code='book'`;
    assert.equal((await creators.getCreators({ publicOnly: true })).totalCount, 0);
    await client`UPDATE media_types SET is_publicly_available=true WHERE code='book'`;
    assert.equal(await creators.getCreatorBySlug("missing"), null);
    for (const preservation of ["none", "avatar", "manual", "series"] as const) {
      const name = `Orphan ${preservation}`;
      await sync(3, [name]);
      const pending = (await requests.getCreatorRequests()).find(row => row.externalCreatorName === name)!;
      const decision = await requests.resolveCreatorRequest({ requestId: pending.id, adminId: 1, decision: "create", name });
      await requests.applyCreatorRequest(pending.id, { jobRunId: decision.jobRunId });
      await client`UPDATE job_runs SET status='succeeded' WHERE id=${decision.jobRunId}`;
      const target = (await creators.getEntryCreators(3)).find(row => row.name === name)!;
      if (preservation === "avatar") await client`UPDATE creators SET avatar_object_key=${`avatars/creators/${target.id}/00000000-0000-4000-8000-000000000001.webp`}, avatar_source='manual', avatar_content_hash=${"a".repeat(64)} WHERE id=${target.id}`;
      if (preservation === "manual") await creators.setManualEntryCreators(3, [{ creatorId: target.id, roleId: writer.id }]);
      if (preservation === "series") await creators.updateCreator(target.id, { name, slug: target.slug, typeId: person.id, seriesIds: [1] });
      const [mapping] = await client`SELECT id FROM provider_creator_mappings WHERE creator_id=${target.id}`;
      const returned = await requests.reopenCreatorMapping({ mappingId: mapping.id, adminId: 1 });
      await client`UPDATE job_runs SET status='failed' WHERE id=${returned.jobRunId}`;
      const retried = await requests.retryCreatorRequest({ requestId: pending.id, adminId: 1 });
      assert.equal((await client`SELECT payload FROM job_runs WHERE id=${retried.jobRunId}`)[0].payload.orphanCreatorId, target.id);
      await requests.applyCreatorRequest(pending.id, { jobRunId: retried.jobRunId });
      await client`UPDATE job_runs SET status='succeeded' WHERE id=${retried.jobRunId}`;
      assert.equal(Boolean(await creators.getCreatorBySlug(target.slug)), preservation === "manual" || preservation === "series");
      assert.equal((await requests.getCreatorRequests({ requestId: pending.id }))[0].status, "pending");
      if (preservation === "manual") await creators.setManualEntryCreators(3, []);
    }


    // Keep relation scenarios after the legacy assertions: these add public creators.
    const syncRelationAuthors = async (entryId: number, authors: string[]) => {
      await db.transaction(tx => requests.syncProviderCreators(tx, { mediaItemId: entryId, provider: "google-books", mediaType: "book", facts: { authors }, autoApprove: true }));
    };
    const daniel = await creators.createCreator({ name: "Daniel Abraham", slug: "daniel-abraham", typeId: person.id });
    const ty = await creators.createCreator({ name: "Ty Franck", slug: "ty-franck", typeId: person.id });
    const extra = await creators.createCreator({ name: "Extra Writer", slug: "extra-writer", typeId: person.id });
    const relations = [daniel, ty].map(row => ({ targetCreatorId: row.id, relationType: "pseudonym_of" as const }));
    const corey = await creators.createCreator({ name: "James S. A. Corey", slug: "james-corey", typeId: person.id, relations, adminId: 1 });
    const other = await creators.createCreator({ name: "Other Collective", slug: "other-collective", typeId: person.id, relations });
    await creators.updateCreator(corey.id, { name: corey.name, slug: corey.slug, typeId: person.id });
    assert.equal((await client`SELECT count(*)::int n FROM creator_relations WHERE source_creator_id=${corey.id}`)[0].n, 2, "omitting relations preserves them");
    await assert.rejects(client`INSERT INTO creator_relations(source_creator_id,target_creator_id,relation_type) VALUES(${corey.id},${daniel.id},'pseudonym_of')`);
    await assert.rejects(client`INSERT INTO creator_relations(source_creator_id,target_creator_id,relation_type) VALUES(${corey.id},${corey.id},'pseudonym_of')`);
    await assert.rejects(client`INSERT INTO creator_relations(source_creator_id,target_creator_id,relation_type) VALUES(${corey.id},${ty.id},'unknown')`);
    await assert.rejects(client`INSERT INTO creator_relations(source_creator_id,target_creator_id,relation_type) VALUES(${corey.id},2147483647,'pseudonym_of')`);
    await assert.rejects(creators.updateCreator(corey.id, { name: "Must roll back", slug: corey.slug, typeId: person.id, relations: [{ targetCreatorId: corey.id, relationType: "pseudonym_of" }] }));
    assert.equal((await creators.getCreatorBySlug(corey.slug))!.name, corey.name);
    assert.equal((await client`SELECT count(*)::int n FROM creator_relations WHERE source_creator_id=${corey.id}`)[0].n, 2);

    await syncRelationAuthors(1, [daniel.name]);
    assert.deepEqual((await creators.getEntryPseudonymState(1)).candidates, []);
    await assert.rejects(creators.setEntryPseudonym(1, corey.id, 1));
    await creators.setManualEntryCreators(1, [{ creatorId: ty.id, roleId: writer.id }]);
    assert.deepEqual((await creators.getEntryPseudonymState(1)).candidates.map(row => row.id).sort((a,b) => a-b), [corey.id, other.id], "manually assigned authors also complete the pseudonym composition");
    await syncRelationAuthors(1, [daniel.name, ty.name, extra.name]);
    await client`UPDATE entry_creator_sources SET provider='open-library' WHERE entry_id=1 AND creator_id=${ty.id}`;
    const complete = await creators.getEntryPseudonymState(1);
    assert.deepEqual(complete.candidates.map(row => row.id).sort((a, b) => a - b), [corey.id, other.id]);
    const rawBefore = await client`SELECT * FROM entry_creators WHERE entry_id=1 ORDER BY creator_id,role_id`;
    const sourcesBefore = await client`SELECT * FROM entry_creator_sources WHERE entry_id=1 ORDER BY creator_id,role_id,provider,normalized_external_creator_name`;
    assert.ok((await creators.getEntryCreators(1)).every(row => row.hasProviderSource));
    await creators.setEntryPseudonym(1, corey.id, 1);
    await creators.setEntryPseudonym(1, corey.id, 1);
    assert.deepEqual((await creators.getEntryPseudonymState(1)).selected, { id: corey.id, name: corey.name, isComplete: true });
    const displayedIds = async (entryId: number) => (await db.select({ id: mediaItems.id, writers: creators.entryWriterCreatorsJsonSql() }).from(mediaItems)).find(row => row.id === entryId)!.writers.map(row => row.id).sort((a, b) => a - b);
    assert.deepEqual(await displayedIds(1), [extra.id, corey.id].sort((a, b) => a - b));
    await client`UPDATE media_item_metadata SET facts=${JSON.stringify({ authors: [extra.name, ty.name, daniel.name] })}::jsonb,source_provider='google-books' WHERE media_item_id=1`;
    await client`UPDATE entry_creator_sources SET provider='google-books' WHERE entry_id=1`;
    const [providerFacts] = await db.select({ authors: creators.entryProviderWriterCreatorsJsonSql() }).from(mediaItems).where(eq(mediaItems.id, 1));
    assert.deepEqual(providerFacts.authors.map(row => row.id), [extra.id, ty.id, daniel.id], "facts preserve provider authors and order, excluding the selected pseudonym");
    await creators.setManualEntryCreators(4, [{ creatorId: corey.id, roleId: writer.id }]);
    const [manualFacts] = await db.select({ authors: creators.entryProviderWriterCreatorsJsonSql() }).from(mediaItems).where(eq(mediaItems.id, 4));
    assert.deepEqual(manualFacts.authors, [], "manual authors are not provider metadata");
    await creators.setManualEntryCreators(4, []);
    await client`UPDATE entry_creator_sources SET provider='open-library' WHERE entry_id=1 AND creator_id=${ty.id}`;

    assert.deepEqual(await client`SELECT * FROM entry_creators WHERE entry_id=1 ORDER BY creator_id,role_id`, rawBefore);
    assert.deepEqual(await client`SELECT * FROM entry_creator_sources WHERE entry_id=1 ORDER BY creator_id,role_id,provider,normalized_external_creator_name`, sourcesBefore);
    const matchedIds = async (creatorId: number) => (await db.select({ id: mediaItems.id }).from(mediaItems).where(creators.creatorWriterCondition(creatorId))).map(row => row.id);
    for (const author of [corey, daniel, ty]) assert.ok((await matchedIds(author.id)).includes(1));
    const textMatchedIds = async (query: string) => (await db.select({ id: mediaItems.id }).from(mediaItems).where(creators.entryCreatorSearchCondition(query))).map(row => row.id);
    for (const query of ["James S. A. Corey", "Daniel Abraham", "Ty Franck", "  JAMES   s. a. COREY  ", "  DANIEL   abraham "]) {
      assert.ok((await textMatchedIds(query)).includes(1), "text search includes the selected pseudonym and its real authors with normalization");
    }
    assert.deepEqual(await textMatchedIds("No matching creator"), []);
    assert.ok((await creators.searchArchiveCreatorMatches("James S. A. Corey", ["book"])).items.some(row => row.id === corey.id));
    assert.ok((await creators.getCreators({ publicOnly: true, q: corey.name })).items.some(row => row.id === corey.id));
    await creators.setEntryPseudonym(1, other.id, 1);
    assert.equal((await creators.getEntryPseudonymState(1)).selected!.id, other.id);
    assert.deepEqual(await displayedIds(1), [extra.id, other.id].sort((a, b) => a - b));
    await creators.setEntryPseudonym(1, null, 1);
    assert.equal((await creators.getEntryPseudonymState(1)).selected, null);
    assert.deepEqual(await displayedIds(1), [daniel.id, ty.id, extra.id].sort((a, b) => a - b));
    await creators.setEntryPseudonym(1, corey.id, 1);
    await creators.setManualEntryCreators(1, []);
    await syncRelationAuthors(1, [daniel.name]);
    assert.deepEqual((await creators.getEntryPseudonymState(1)).selected, { id: corey.id, name: corey.name, isComplete: false });
    assert.deepEqual(await displayedIds(1), [corey.id]);
    await assert.rejects(creators.setEntryPseudonym(1, other.id, 1));
    assert.equal((await creators.getEntryPseudonymState(1)).selected!.id, corey.id, "failed replacement preserves selection");
    await creators.setManualEntryCreators(4, [{ creatorId: corey.id, roleId: writer.id }]);
    for (const author of [corey, daniel, ty]) assert.ok((await matchedIds(author.id)).includes(4), "direct pseudonym assignment expands to its members");
    for (const query of [corey.name, daniel.name, ty.name]) assert.ok((await textMatchedIds(query)).includes(4), "directly assigned pseudonym is searchable by each member");
    await syncRelationAuthors(5, [daniel.name]);
    assert.ok(!(await textMatchedIds(corey.name)).includes(5), "text search does not infer a collective pseudonym from one author");
    assert.ok(!(await matchedIds(corey.id)).includes(5), "an individual author does not imply their collective pseudonym");
    await creators.updateCreator(corey.id, { name: corey.name, slug: corey.slug, typeId: person.id, relations: [{ targetCreatorId: extra.id, relationType: "pseudonym_of" }] });
    assert.deepEqual(await displayedIds(1), [daniel.id, corey.id].sort((a, b) => a - b), "display uses the current relation membership");
    const removable = await creators.createCreator({ name: "Temporary Collective", slug: "temporary-collective", typeId: person.id, relations });
    await creators.deleteCreator(removable.id);
    assert.equal((await client`SELECT count(*)::int n FROM creator_relations WHERE source_creator_id=${removable.id}`)[0].n, 0);
    assert.ok((await client`SELECT count(*)::int n FROM admin_activity_logs WHERE admin_user_id=1 AND entity_id=1`)[0].n > 0);


    const seriesPseudonym = await creators.createCreator({ name: "Series Collective", slug: "series-collective", typeId: person.id, relations, seriesIds: [1, 2] });
    const inheritedBefore = await client`SELECT * FROM creator_series WHERE creator_id IN (${daniel.id},${ty.id})`;
    for (const member of [daniel, ty]) {
      assert.deepEqual((await creators.getCreatorBySlug(member.slug))!.series.map(row => row.id), [1], "only published series are inherited publicly");
      const adminMember = (await creators.getAdminCreatorById(member.id))!;
      assert.deepEqual(adminMember.seriesIds, [], "inherited links are never saved as direct links");
      assert.deepEqual(adminMember.inheritedSeries.map(row => [row.id, row.sourceCreatorId]), [[1, seriesPseudonym.id], [2, seriesPseudonym.id]], "admin includes draft series with their source pseudonym");
    }
    assert.deepEqual(await client`SELECT * FROM creator_series WHERE creator_id IN (${daniel.id},${ty.id})`, inheritedBefore);
    await creators.updateCreator(daniel.id, { name: daniel.name, slug: daniel.slug, typeId: person.id, seriesIds: [1] });
    assert.deepEqual((await creators.getCreatorBySlug(daniel.slug))!.series.map(row => row.id), [1], "direct and inherited duplicates collapse");
    await creators.updateCreator(seriesPseudonym.id, { name: seriesPseudonym.name, slug: seriesPseudonym.slug, typeId: person.id, relations, seriesIds: [] });
    assert.deepEqual((await creators.getCreatorBySlug(ty.slug))!.series, [], "removing pseudonym series immediately removes inheritance");
    assert.deepEqual((await creators.getCreatorBySlug(seriesPseudonym.slug))!.series, [], "personal series do not flow back to a pseudonym");
    await creators.updateCreator(seriesPseudonym.id, { name: seriesPseudonym.name, slug: seriesPseudonym.slug, typeId: person.id, relations: [], seriesIds: [1] });
    assert.deepEqual((await creators.getCreatorBySlug(ty.slug))!.series, [], "removing membership immediately removes inheritance");
    assert.deepEqual((await creators.getCreatorBySlug(daniel.slug))!.series.map(row => row.id), [1], "direct series survive changes to pseudonym membership");


    // Confirmed FantLab identities do not depend on display names or legacy aliases.
    const fantlabCreator = await creators.createCreator({ name: "FantLab Canonical", slug: "fantlab-canonical", typeId: person.id });
    const wrongNameCreator = await creators.createCreator({ name: "Same FantLab Name", slug: "fantlab-same-name", typeId: person.id });
    const [binding] = await client`INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id) VALUES('fantlab','12345',${fantlabCreator.id}) RETURNING id`;
    await client`INSERT INTO provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) VALUES('fantlab','book','Same FantLab Name','same fantlab name',${wrongNameCreator.id})`;
    await creators.setManualEntryCreators(3, []);
    const fantlabSync = async (facts: Record<string, unknown>) => {
      await client`INSERT INTO media_item_metadata(media_item_id,source_provider,facts) VALUES(3,'fantlab',${JSON.stringify(facts)}::jsonb) ON CONFLICT(media_item_id) DO UPDATE SET source_provider=EXCLUDED.source_provider,facts=EXCLUDED.facts`;
      return db.transaction(tx => requests.syncProviderCreators(tx, { mediaItemId: 3, provider: "fantlab", mediaType: "book", facts, autoApprove: true }));
    };
    await fantlabSync({ fantlabAuthors: [{ id: "12345", name: "Same FantLab Name" }] });
    const countBeforeFantlab = (await client`SELECT count(*)::int n FROM creators`)[0].n;
    const requestCountBeforeFantlab = (await client`SELECT count(*)::int n FROM creator_requests`)[0].n;
    await fantlabSync({ authors: ["Same FantLab Name"], fantlabAuthors: [{ id: "12345", name: "Same FantLab Name" }, { id: "99999", name: "Unknown FantLab" }] });
    assert.deepEqual((await client`SELECT creator_id FROM entry_creator_sources WHERE entry_id=3`).map(row => row.creator_id), [fantlabCreator.id], "canonical ID wins over a conflicting name alias");
    const [conflictingAlias] = await client`SELECT creator_id,binding_id FROM provider_creator_mappings WHERE provider='fantlab' AND normalized_external_creator_name='same fantlab name'`;
    assert.equal(conflictingAlias.creator_id, wrongNameCreator.id);
    assert.equal(conflictingAlias.binding_id, null, "name collisions are never rewritten automatically");
    assert.equal((await client`SELECT count(*)::int n FROM creators`)[0].n, countBeforeFantlab);
    assert.equal((await client`SELECT count(*)::int n FROM creator_requests`)[0].n, requestCountBeforeFantlab, "unknown IDs are diagnosed without unsafe name-keyed requests");
    assert.ok((await client`SELECT count(*)::int n FROM admin_activity_logs WHERE entity_type='media-item' AND entity_id=3 AND metadata->'diagnostics' IS NOT NULL`)[0].n > 0);
    await fantlabSync({ authors: ["Renamed FantLab"], fantlabAuthors: [{ id: "12345", name: "Renamed FantLab" }] });
    const [renamedAlias] = await client`SELECT creator_id,binding_id FROM provider_creator_mappings WHERE provider='fantlab' AND normalized_external_creator_name='renamed fantlab'`;
    assert.equal(renamedAlias.creator_id, fantlabCreator.id);
    assert.equal(renamedAlias.binding_id, binding.id);
    await fantlabSync({ authors: ["Different legacy name"] });
    assert.deepEqual((await client`SELECT creator_id FROM entry_creator_sources WHERE entry_id=3`).map(row => row.creator_id), [fantlabCreator.id], "legacy metadata preserves confirmed provenance");
    await fantlabSync({ fantlabAuthors: [{ id: "12345", name: "Renamed FantLab" }] });
    assert.equal((await client`SELECT count(*)::int n FROM entry_creator_sources WHERE entry_id=3`)[0].n, 1, "repeated ID sync is idempotent");

    await fantlabSync({ fantlabAuthors: [{ id: "99999", name: "Unmigrated author" }] });
    assert.deepEqual((await client`SELECT creator_id FROM entry_creator_sources WHERE entry_id=3`).map(row => row.creator_id), [fantlabCreator.id], "unknown IDs preserve old provenance until identity migration completes");
    await fantlabSync({ fantlabAuthors: [{ id: "12345", name: "Renamed FantLab" }] });
    const [moderationAlias] = await client`SELECT id FROM provider_creator_mappings WHERE provider='fantlab' AND normalized_external_creator_name='renamed fantlab'`;
    const reopenedFantlab = await requests.reopenCreatorMapping({ mappingId: moderationAlias.id, adminId: 1 });
    await requests.applyCreatorRequest(reopenedFantlab.requestId, { jobRunId: reopenedFantlab.jobRunId });
    assert.equal((await client`SELECT count(*)::int n FROM entry_creator_sources WHERE entry_id=3`)[0].n, 0, "reopening a confirmed-ID alias removes its links");
    assert.equal((await client`SELECT count(*)::int n FROM provider_creator_mappings WHERE provider='fantlab' AND normalized_external_creator_name='renamed fantlab'`)[0].n, 0, "ID sync does not recreate manually reopened aliases");
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${reopenedFantlab.jobRunId}`;
    const excludedFantlab = await requests.resolveCreatorRequest({ requestId: reopenedFantlab.requestId, adminId: 1, decision: "exclude" });
    await requests.applyCreatorRequest(reopenedFantlab.requestId, { jobRunId: excludedFantlab.jobRunId });
    await fantlabSync({ fantlabAuthors: [{ id: "12345", name: "Renamed FantLab" }] });
    assert.equal((await client`SELECT count(*)::int n FROM entry_creator_sources WHERE entry_id=3`)[0].n, 0, "explicit exclusion wins over canonical IDs");
    await client`INSERT INTO entry_creators(entry_id,creator_id,role_id) VALUES(3,${fantlabCreator.id},${writer.id}) ON CONFLICT DO NOTHING`;
    await client`INSERT INTO entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) VALUES(3,${fantlabCreator.id},${writer.id},'fantlab','renamed fantlab')`;
    await fantlabSync({ authors: ["Renamed FantLab"] });
    assert.equal((await client`SELECT count(*)::int n FROM entry_creator_sources WHERE entry_id=3`)[0].n, 0, "legacy name-only metadata respects explicit exclusions");

    // Exercise genre detection in the same provider transaction and outbox infrastructure.
    await client.unsafe(`CREATE TABLE genres(id integer PRIMARY KEY,slug text,name text,is_active boolean);
      CREATE TABLE provider_genre_mappings(provider text,media_type text,external_genre_id text,normalized_external_genre_name text,genre_id integer);
      CREATE TABLE provider_genre_exclusions(provider text,media_type text,normalized_external_genre_name text);`);
    for (const statement of readFileSync("drizzle/0104_genre_requests.sql", "utf8").split("--> statement-breakpoint").slice(0, 2)) await client.unsafe(statement);
    const { lockGenreRequestsForMetadata } = await import("../src/db/queries/genre-requests");
    const detectGenre = (mediaItemId: number, name: string) => db.transaction(tx => lockGenreRequestsForMetadata(tx, {
      mediaItemId, provider: "test-provider", mediaType: "book", facts: { genres: [name] },
    }));
    await detectGenre(1, "Новый жанр");
    await detectGenre(2, " НОВЫЙ ЖАНР ");
    assert.equal((await client`SELECT count(*)::int n FROM domain_events WHERE type='genre-request.created'`)[0].n, 1, "genre events deduplicate across records");
    await assert.rejects(db.transaction(async tx => {
      await lockGenreRequestsForMetadata(tx, { mediaItemId: 3, provider: "test-provider", mediaType: "book", facts: { genres: ["Откат жанра"] } });
      throw new Error("rollback genre");
    }));
    assert.equal((await client`SELECT count(*)::int n FROM domain_events WHERE type='genre-request.created'`)[0].n, 1);
    assert.equal((await client`SELECT count(*)::int n FROM genre_requests WHERE normalized_external_genre_name='откат жанра'`)[0].n, 0);

  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
