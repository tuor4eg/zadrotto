import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { createEmptyDemoProfile, parseDemoProfile } from "../src/lib/user-state/demo-profile"

const testUrl = process.env.MEDIA_STATUS_TEST_DATABASE_URL
const cleanup = readFileSync("drizzle/0001_remove_skipped_media_status.sql", "utf8")
const statements = cleanup.split("--> statement-breakpoint").filter(value => value.trim())

test("retired status cleanup is atomic, preserves all other history and installs a wanted-only constraint", { skip: !testUrl }, async () => {
  const name = `remove_skipped_${randomUUID().replaceAll("-", "")}`
  const admin = postgres(testUrl!, { max: 1, onnotice: () => {} })
  const databaseUrl = new URL(testUrl!)
  databaseUrl.pathname = `/${name}`
  let db: ReturnType<typeof postgres> | undefined
  let closeAppDb: (() => Promise<void>) | undefined
  const previousDatabaseUrl = process.env.DATABASE_URL
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`)
    db = postgres(databaseUrl.toString(), { max: 1, onnotice: () => {} })
    const baseline = readFileSync("drizzle/0000_baseline.sql", "utf8")
    await db.begin(async tx => {
      for (const statement of baseline.split("--> statement-breakpoint").filter(value => value.trim())) await tx.unsafe(statement)
    })
    await db.unsafe(`
      INSERT INTO authors(id,code,name,access_profile_id) VALUES (10001,'cleanup-author','Автор',2),(10002,'cleanup-author-two','Другой автор',2);
      INSERT INTO media_items(id,code,title,media_type) VALUES (10001,'cleanup-one','Первая','game'),(10002,'cleanup-two','Вторая','game'),(10003,'cleanup-three','Третья','game');
      INSERT INTO author_media_statuses(author_id,media_item_id,status) VALUES (10001,10001,'skipped'),(10002,10001,'skipped'),(10001,10002,'wanted'),(10002,10003,'wanted');
      INSERT INTO title_parts(id,media_item_id,type,number,sort_order) VALUES (10001,10002,'season',1,1);
      INSERT INTO ratings(author_id,media_item_id,score) VALUES (10001,10003,80);
      INSERT INTO ratings(author_id,media_item_id,part_id,score) VALUES (10002,10002,10001,70);
      INSERT INTO author_media_experiences(author_id,media_item_id,first_experienced_at,first_experienced_precision) VALUES (10001,10001,'2020-01-01','year');
      INSERT INTO contributions(id,type,author_id,primary_media_item_id) VALUES (10001,'review',10001,10001);
      INSERT INTO contribution_reviews(contribution_id,title,body) VALUES (10001,'Рецензия','Текст');
    `)
    const unrelated = async () => ({
      media: await db!`select * from media_items order by id`,
      ratings: await db!`select * from ratings order by id`,
      parts: await db!`select * from title_parts order by id`,
      experiences: await db!`select * from author_media_experiences order by id`,
      reviews: await db!`select * from contribution_reviews order by contribution_id`,
    })
    const before = await unrelated()
    const wanted = await db`select * from author_media_statuses where status='wanted' order by id`
    await assert.rejects(db.begin(async tx => {
      for (const statement of statements) await tx.unsafe(statement)
      throw new Error("rollback cleanup")
    }), /rollback cleanup/)
    assert.equal((await db`select count(*)::int n from author_media_statuses where status='skipped'`)[0].n, 2)
    await db.begin(async tx => { for (const statement of statements) await tx.unsafe(statement) })
    assert.equal((await db`select count(*)::int n from author_media_statuses where status='skipped'`)[0].n, 0)
    assert.deepEqual(await db`select * from author_media_statuses order by id`, wanted)
    assert.deepEqual(await unrelated(), before)
    await assert.rejects(db`insert into author_media_statuses(author_id,media_item_id,status) values(10001,10001,'skipped')`, { code: "23514" })
    await db`insert into author_media_statuses(author_id,media_item_id,status) values(10001,10001,'wanted')`
    await db`insert into authors(id,code,name,access_profile_id) values(10003,'demo-import-author','Демо',2)`
    process.env.DATABASE_URL = databaseUrl.toString()
    const { importDemoProfile } = await import("../src/db/operations/demo-profile-import")
    const { getDbClient } = await import("../src/db")
    closeAppDb = () => getDbClient().end()
    const profile = parseDemoProfile({ ...createEmptyDemoProfile(), schemaVersion: 2, statuses: {
      "missing-retired-record": { status: "skipped", updatedAt: "2026-11-07" },
      "cleanup-two": { status: "wanted", updatedAt: "2026-11-07" },
    } })!
    const input = { authorId: 10003, accessibleMediaTypeCodes: ["game"], profile }
    assert.deepEqual(await importDemoProfile(input), { importedRatings: 0, importedStatuses: 1, skippedConflicts: 0, skippedUnavailable: 0 })
    assert.deepEqual(await importDemoProfile(input), { importedRatings: 0, importedStatuses: 0, skippedConflicts: 1, skippedUnavailable: 0 })
    assert.deepEqual((await db`select status from author_media_statuses where author_id=10003`).map(row => row.status), ["wanted"])
    await closeAppDb()
    closeAppDb = undefined
    // Verify the standard migration runner also installs the full fresh schema.
    await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
    await migrate(drizzle(db), { migrationsFolder: "drizzle" })
    const [constraint] = await db`select pg_get_constraintdef(oid) definition from pg_constraint where conname='author_media_statuses_status_check'`
    assert.match(constraint.definition, /wanted/)
    assert.doesNotMatch(constraint.definition, /skipped/)
  } finally {
    await closeAppDb?.()
    await db?.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`)
    await admin.end()
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  }
})
