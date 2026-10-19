import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";

const url = process.env.CREATOR_AVATARS_TEST_DATABASE_URL;
test("creator avatar migration and assignments preserve data, identity ownership and manual priority", { skip: !url }, async () => {
  // Use a dedicated disposable database only; never point this test at an application database.
  process.env.DATABASE_URL = url!;
  const sql = postgres(url!, { max: 1, onnotice() {} });
  const { dbClient } = await import("../src/db");
  const queries = await import("../src/db/queries/creator-avatars");
  const key = (id: number, digit: string) => `avatars/creators/${id}/00000000-0000-4000-8000-${digit.repeat(12)}.webp`;
  const hash = "a".repeat(64);
  try {
    await sql.unsafe(`CREATE TABLE creators(id serial PRIMARY KEY,name text NOT NULL,slug text NOT NULL UNIQUE,original_name text,type_id integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE provider_creator_mappings(id serial PRIMARY KEY,provider text NOT NULL,media_type text NOT NULL,external_creator_name text NOT NULL,normalized_external_creator_name text NOT NULL,creator_id integer NOT NULL REFERENCES creators(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO creators(id,name,slug,type_id) VALUES(1,'Автор А','a',1),(2,'Автор Б','b',1),(3,'Другой провайдер','c',1);
      INSERT INTO provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) VALUES('fantlab','book','Автор А','автор а',1),('fantlab','book','Author A','author a',1),('fantlab','book','Автор Б','автор б',2),('bgg','boardgame','Other','other',3);`);
    const before = await sql`SELECT id,name,slug,original_name,type_id,created_at,updated_at FROM creators ORDER BY id`;
    for (const statement of readFileSync("drizzle/0123_creator_avatars.sql", "utf8").split("--> statement-breakpoint")) await sql.unsafe(statement);
    // Later migration 0124 adds a diagnostic name to the binding projection.
    await sql.unsafe("ALTER TABLE provider_creator_bindings ADD COLUMN external_creator_name text, ADD COLUMN active boolean NOT NULL DEFAULT true");
    assert.deepEqual(await sql`SELECT id,name,slug,original_name,type_id,created_at,updated_at FROM creators ORDER BY id`, before);
    assert.equal((await queries.getFantlabCreatorBatch(0)).length, 2);
    assert.equal((await queries.getCreatorAvatarState(3))?.avatarObjectKey, null);
    const binding = await queries.assignFantlabCreatorBinding({ creatorId: 1, externalCreatorId: "20", mappingIds: [1, 2], expectedVersion: 0 });
    assert.equal((await queries.getCreatorFantlabMappings(1)).every(mapping => mapping.bindingId === binding.id), true);
    await assert.rejects(queries.assignFantlabCreatorBinding({ creatorId: 2, externalCreatorId: "20", mappingId: 3 }));
    // Composite ownership FK prevents even direct SQL from mixing creator/provider identities.
    await assert.rejects(sql`UPDATE provider_creator_mappings SET binding_id=${binding.id} WHERE creator_id=2`);
    const state = (await queries.getCreatorAvatarState(1))!;
    const imported = { creatorId: 1, bindingId: binding.id, externalCreatorId: "20", expectedVersion: state.avatarVersion,
      objectKey: key(1,"1"), contentHash: hash, sourceUrl: "https://fantlab.ru/autor20", originalUrl: "https://fantlab.ru/images/autors/20" };
    assert.equal((await queries.commitFantlabAvatar(imported)).committed, true);
    // Two imports started at the same version: exactly one can commit.
    const next = (await queries.getCreatorAvatarState(1))!;
    const concurrent = await Promise.all([queries.commitFantlabAvatar({ ...imported, expectedVersion: next.avatarVersion, objectKey: key(1,"2") }), queries.commitFantlabAvatar({ ...imported, expectedVersion: next.avatarVersion, objectKey: key(1,"3") })]);
    assert.equal(concurrent.filter(result => result.committed).length, 1);
    const stale = (await queries.getCreatorAvatarState(1))!;
    await queries.assignManualCreatorAvatar(1, { objectKey: key(1,"4"), contentHash: hash });
    assert.equal((await queries.commitFantlabAvatar({ ...imported, expectedVersion: stale.avatarVersion })).committed, false);
    assert.equal((await queries.getCreatorAvatarState(1))?.avatarSource, "manual");
    const manual = (await queries.getCreatorAvatarState(1))!;
    assert.equal((await queries.commitFantlabAvatar({ ...imported, expectedVersion: manual.avatarVersion })).committed, false);
    assert.equal(await queries.clearCreatorAvatar(1), key(1,"4"));
    const cleared = (await queries.getCreatorAvatarState(1))!;
    assert.equal(cleared.avatarObjectKey, null);
    assert.equal((await queries.commitFantlabAvatar({ ...imported, expectedVersion: manual.avatarVersion })).committed, false);
    const secondBinding = await queries.assignFantlabCreatorBinding({ creatorId: 1, externalCreatorId: "21", mappingId: 2 });
    assert.notEqual(secondBinding.id, binding.id);
    assert.equal((await queries.commitFantlabAvatar({ ...imported, expectedVersion: (await queries.getCreatorAvatarState(1))!.avatarVersion })).committed, false);
    await queries.replaceCreatorFantlabBinding({ creatorId: 1, externalCreatorId: "21" });
    assert.equal((await queries.getCreatorFantlabBindings(1)).length, 1);
    assert.equal((await queries.getCreatorFantlabMappings(1)).every(mapping => mapping.bindingId === secondBinding.id), true);
    // Null source cannot silently pass a CHECK through SQL's three-valued logic.
    await assert.rejects(sql`UPDATE creators SET avatar_object_key=${key(2,"5")},avatar_content_hash=${hash} WHERE id=2`);
    await assert.rejects(sql`UPDATE creators SET avatar_source='fantlab',avatar_object_key=${key(2,"5")},avatar_content_hash=${hash} WHERE id=2`);
    await assert.rejects(queries.assignManualCreatorAvatar(2, { objectKey: key(1,"6"), contentHash: hash }));
    assert.equal((await sql`SELECT count(*)::int n FROM creators`)[0].n, 3);
    assert.equal((await sql`SELECT binding_id FROM provider_creator_mappings WHERE creator_id=3`)[0].binding_id, null);
  } finally {
    await dbClient.end();
    await sql.unsafe("DROP TABLE IF EXISTS provider_creator_mappings,provider_creator_bindings,creators CASCADE");
    await sql.end();
  }
});
