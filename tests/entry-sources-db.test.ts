import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";

import { and, asc, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { mediaItems } from "../src/db/schema";

const enabled = process.env.ENTRY_SOURCES_DB_TEST === "1";
const container = `zadrotto-entry-sources-test-${process.pid}`;
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
const previousUrl = process.env.DATABASE_URL;
const accessible = ["book", "film"];
let client: ReturnType<typeof postgres> | undefined;
let app: typeof import("../src/db") | undefined;
let queries: typeof import("../src/db/queries/entry-sources");
let started = false;

describe("entry sources in a disposable PostgreSQL database", { skip: !enabled }, () => {
  before(async () => {
    docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=entry-sources-test", "-p", "127.0.0.1::5432", "postgres:18");
    started = true;
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
    const url = `postgres://postgres:entry-sources-test@127.0.0.1:${port}/postgres`;
    client = postgres(url, { connect_timeout: 2, onnotice() {} });
    for (let attempt = 0; ; attempt++) {
      try { await client`select 1`; break; }
      catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    process.env.DATABASE_URL = url;
    app = await import("../src/db");
    queries = await import("../src/db/queries/entry-sources");
    await migrate(app.db, { migrationsFolder: "./drizzle" });
    const [tables] = await client`select to_regclass('creator_series') as legacy, to_regclass('entry_sources')::text as sources`;
    assert.equal(tables.legacy, null);
    assert.equal(tables.sources, "entry_sources");
    await client.unsafe(`
      update media_types set is_publicly_available = true where code in ('book', 'film', 'game');
      insert into creators(id, name, slug, type_id) values
        (901, 'Пётр', 'petr', 1), (902, 'Организация', 'org', 1);
      insert into franchises(id, code, title, publication_status) values
        (901, 'source-series', 'Серия', 'published'), (902, 'hidden-series', 'Скрытая серия', 'private');
      insert into franchises(id, parent_id, code, title) values (903, 901, 'child-series', 'Подсерия');
      insert into media_items(id, code, title, media_type, publication_status, release_year) values
        (901, 'source-book', 'Произведение', 'book', 'published', 1980),
        (902, 'adaptation', 'Адаптация', 'film', 'published', 2000),
        (903, 'indirect', 'Вторая адаптация', 'film', 'published', 2002),
        (904, 'private', 'Закрытая запись', 'book', 'private', 1990),
        (905, 'inaccessible', 'Другой тип', 'game', 'published', 2005),
        (906, 'series-only', 'Запись в серии', 'film', 'published', 2006),
        (907, 'child-series-based', 'На основе подсерии', 'film', 'published', 2007),
        (908, 'based-on-private', 'На основе закрытой', 'film', 'published', 2008),
        (909, 'based-on-inaccessible', 'На основе другого типа', 'film', 'published', 2009),
        (910, 'creator-based', 'По мотивам', 'film', 'published', 2010);
      insert into entry_creators(entry_id, creator_id, role_id) values
        (901, 901, 3), (901, 901, 5), (904, 901, 3), (905, 901, 3), (902, 902, 7);
      insert into media_item_franchises(media_item_id, franchise_id) values (906, 901);
    `);
  });

  after(async () => {
    try {
      if (app) await app.getDbClient().end({ timeout: 2 });
      await client?.end({ timeout: 2 });
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (started) docker("stop", container);
    }
  });

  it("saves each source kind, retains existing links and rolls back invalid replacements", async () => {
    const existing = [
      { type: "creator", id: 901 }, { type: "entry", id: 901 }, { type: "series", id: 901 },
    ] as const;
    const next = [...existing, { type: "creator", id: 902 }, { type: "entry", id: 904 },
      { type: "entry", id: 905 }, { type: "series", id: 902 }] as const;
    assert.equal(await queries.saveEntrySources(902, [...existing]), true);
    const originalRows = await client!`select id, created_at from entry_sources where entry_id=902 order by id`;
    assert.equal(await queries.saveEntrySources(902, [...next]), true);
    assert.deepEqual(await client!`select id, created_at from entry_sources where entry_id=902 order by id limit 3`, originalRows);
    await assert.rejects(queries.saveEntrySources(902, [{ type: "creator", id: 9999 }]));
    assert.equal((await queries.getEntrySources(902)).length, next.length);
    assert.equal(await queries.saveEntrySources(9999, []), false);
    await queries.saveEntrySources(903, [{ type: "entry", id: 902 }]);
    await queries.saveEntrySources(904, [{ type: "entry", id: 901 }]);
    await queries.saveEntrySources(907, [{ type: "series", id: 903 }]);
    await queries.saveEntrySources(908, [{ type: "entry", id: 904 }]);
    await queries.saveEntrySources(909, [{ type: "entry", id: 905 }]);
    await queries.saveEntrySources(910, [{ type: "creator", id: 901 }]);
  });

  it("enforces all source constraints including uniqueness within each type", async () => {
    for (const statement of [
      "insert into entry_sources(entry_id) values (902)",
      "insert into entry_sources(entry_id, creator_id, source_series_id) values (902, 901, 901)",
      "insert into entry_sources(entry_id, source_entry_id) values (902, 902)",
    ]) {
      await assert.rejects(client!.unsafe(statement), { code: "23514" });
    }
    for (const column of ["creator_id", "source_entry_id", "source_series_id"]) {
      await assert.rejects(client!.unsafe(`insert into entry_sources(entry_id, ${column}) values (902, 901)`), { code: "23505" });
    }
  });

  it("finds existing targets with normalized search and excludes current selections", async () => {
    assert.deepEqual((await queries.searchEntrySourceOptions("creator", "  ПЕТР ", 902, [])).map(({ id }) => id), [901]);
    assert.deepEqual(await queries.searchEntrySourceOptions("creator", "  ПЕТР ", 902, [901]), []);
    const entries = await queries.searchEntrySourceOptions("entry", "адаптация", 902, []);
    const [filmType] = await client!`select name from media_types where code = 'film'`;
    assert.deepEqual(entries.map(({ id, mediaTypeName, releaseYear }) => [id, mediaTypeName, releaseYear]), [
      [903, filmType.name, 2002],
    ]);
    assert.deepEqual((await queries.searchEntrySourceOptions("series", "серия", 902, [902, 903])).map(({ id }) => id), [901]);
  });

  it("lists visible direct sources and keeps a director credited as a source", async () => {
    const publicSources = await queries.getEntrySources(902, accessible);
    assert.deepEqual(publicSources.map(({ type, id }) => [type, id]), [
      ["creator", 901], ["creator", 902], ["entry", 901], ["series", 901],
    ]);
    assert.deepEqual((await queries.getWorksBasedOn("entry", 901, accessible)).map(({ id }) => id), [902]);
    assert.deepEqual((await queries.getWorksBasedOn("series", 901, accessible)).map(({ id }) => id), [902]);
  });

  it("loads public source cards with people and their roles", async () => {
    const { getSourceMediaCards } = await import("../src/db/queries/media-items");
    await client!`insert into creators(id, name, slug, type_id)
      select 903, 'Издательство', 'publisher-org', id from creator_types where code = 'organization'`;
    await client!`insert into entry_creators(entry_id, creator_id, role_id) values (901, 903, 5)`;
    const [card, ...otherCards] = await getSourceMediaCards([901, 904, 905], accessible);
    assert.equal(otherCards.length, 0);
    assert.equal(card.code, "source-book");
    assert.equal(card.releaseYear, 1980);
    assert.deepEqual(card.people.map(({ id, roleCode }) => [id, roleCode]).sort(), [
      [901, "artist"], [901, "publisher"],
    ]);
  });

  it("shows the selected book pseudonym in place of its writers while preserving other roles", async () => {
    const { getSourceMediaCards } = await import("../src/db/queries/media-items");
    await client!`insert into creators(id, name, slug, type_id) values
      (931, 'Литературный псевдоним', 'source-book-pseudonym', 2),
      (932, 'Соавтор книги', 'source-book-coauthor', 1)`;
    await client!`insert into entry_creators(entry_id, creator_id, role_id) values (901, 901, 1), (901, 932, 1)`;
    await client!`insert into creator_relations(source_creator_id, target_creator_id, relation_type)
      values (931, 901, 'pseudonym_of'), (931, 932, 'pseudonym_of')`;

    const [before] = await getSourceMediaCards([901], accessible);
    assert.deepEqual(before.people.filter(({ roleCode }) => roleCode === "writer").map(({ id }) => id).sort(), [901, 932]);

    await client!`insert into entry_creator_pseudonyms(entry_id, creator_id, role_id) values (901, 931, 1)`;
    const [after] = await getSourceMediaCards([901], accessible);
    assert.deepEqual(after.people.map(({ id, roleCode }) => [id, roleCode]).sort(), [
      [901, "artist"], [901, "publisher"], [931, "writer"],
    ]);
  });

  it("includes adaptations under the pseudonym assigned to the original", async () => {
    const { getCatalogMediaTypeCounts } = await import("../src/db/queries/media-items");
    const filters = {
      creatorId: 931, creatorSourceMediaTypeCodes: accessible, enabledMediaTypeCodes: ["film"],
      authorRatingFilter: "all", searchQuery: "", yearFilter: null, yearMode: "release",
    } as const;
    assert.deepEqual(await getCatalogMediaTypeCounts(filters), [{ mediaType: "film", count: 1 }]);
    await client!`delete from entry_creator_pseudonyms where entry_id = 901`;
    assert.deepEqual(await getCatalogMediaTypeCounts(filters), []);
  });

  it("finds creator works across media types, deduplicating both paths and excluding indirect and hidden originals", async () => {
    const query = app!.db.select({ id: mediaItems.id }).from(mediaItems).where(and(
      queries.creatorWorksCondition(901, accessible),
      inArray(mediaItems.id, [901, 902, 903, 906, 907, 908, 909, 910]),
    )).orderBy(asc(mediaItems.id));
    assert.deepEqual(await query, [{ id: 902 }, { id: 910 }]);
    const { getCatalogMediaItems, getCatalogMediaTypeCounts, getCatalogReleaseYearBounds } = await import("../src/db/queries/media-items");
    const filters = {
      creatorId: 901, creatorSourceMediaTypeCodes: accessible, enabledMediaTypeCodes: ["film"],
      authorRatingFilter: "all", searchQuery: "", yearFilter: null, yearMode: "release",
    } as const;
    assert.deepEqual(await getCatalogMediaTypeCounts(filters), [{ mediaType: "film", count: 2 }]);
    const secondPage = await getCatalogMediaItems({
      ...filters, mediaTypeFilter: "all", page: 2, pageSize: 1, sort: "release_year", sortDirection: "asc",
    });
    assert.equal(secondPage.totalCount, 2);
    assert.equal(secondPage.page, 2);
    assert.deepEqual(secondPage.items.map(({ id }) => id), [910]);
    assert.deepEqual(await getCatalogReleaseYearBounds(["film"], undefined, 901, undefined, undefined, accessible), {
      minReleaseYear: 2000,
    });
  });

  it("checks access plans for direct reverse lookups and creator works", async (t) => {
    const lookups = [
      queries.getWorksBasedOn("entry", 901, accessible).toSQL(),
      queries.getWorksBasedOn("series", 901, accessible).toSQL(),
      app!.db.select({ id: mediaItems.id }).from(mediaItems)
        .where(queries.creatorWorksCondition(901, accessible)).toSQL(),
    ];
    for (const lookup of lookups) {
      const rows = await client!.unsafe(`explain (analyze, buffers) ${lookup.sql}`, lookup.params as never);
      t.diagnostic(rows.map((row) => row["QUERY PLAN"]).join("\n"));
    }
    // The tiny fixture may prefer sequential scans. Check that the reverse indexes are eligible.
    await client!.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      for (const [lookup, index] of [
        [lookups[0], "entry_sources_source_entry_idx"],
        [lookups[1], "entry_sources_series_entry_idx"],
        [lookups[2], "entry_sources_creator_entry_idx"],
      ] as const) {
        const rows = await tx.unsafe(`explain ${lookup.sql}`, lookup.params as never);
        assert.ok(rows.some((row) => row["QUERY PLAN"].includes(index)), index);
      }
    });
  });

  it("searches the shared media browser by name and pseudonym while respecting visibility", async () => {
    const { searchAdminMediaBrowser, searchMediaBrowserCreators } = await import("../src/db/queries/admin-media-browser");
    const { parseAdminMediaBrowserQuery } = await import("../src/lib/admin/media-browser");
    await client!`insert into creators(id, name, name_ru, name_ru_source, slug, type_id) values
      (920, 'James Corey', 'Джеймс Кори', 'manual', 'james-corey', 1),
      (921, 'Daniel Abraham', 'Дэниел Абрахам', 'manual', 'daniel-abraham', 1),
      (922, 'James Corey', 'Джеймс Кори', 'manual', 'second-james-corey', 1)`;
    await client!`insert into creator_relations(source_creator_id, target_creator_id, relation_type)
      values (920, 921, 'pseudonym_of')`;
    await client!`insert into media_items(id, code, title, media_type, publication_status)
      values (920, 'second-book', 'Второй роман', 'book', 'published')`;
    await client!`insert into entry_creators(entry_id, creator_id, role_id)
      values (901, 920, 1), (920, 920, 1), (904, 920, 1), (904, 922, 1)`;

    const search = (creator: string, q = "") => parseAdminMediaBrowserQuery(new URLSearchParams({ creator, q, type: "book" }));
    const choices = await searchMediaBrowserCreators("  ДЖЕЙМС   КОРИ ");
    assert.deepEqual(choices.map(({ id }) => id), [920, 922]);
    assert.deepEqual((await searchMediaBrowserCreators("James Corey", ["book"])).map(({ id }) => id), [920]);

    for (const creatorId of ["920", "921"]) {
      const result = await searchAdminMediaBrowser(search(creatorId), ["book"]);
      assert.equal(result.totalCount, 2);
      assert.deepEqual(result.items.map(({ id }) => id).sort(), [901, 920]);
    }
    const result = await searchAdminMediaBrowser(search("920"), undefined, { includeUnpublished: true });
    assert.deepEqual(result.items.map(({ id }) => id).sort(), [901, 904, 920]);
    const otherCreator = await searchAdminMediaBrowser(search("922"), undefined, { includeUnpublished: true });
    assert.deepEqual(otherCreator.items.map(({ id }) => id), [904]);
    const byTitle = await searchAdminMediaBrowser(search("", "Второй роман"));
    assert.deepEqual(byTitle.items.map(({ id }) => id), [920]);
    const combined = await searchAdminMediaBrowser(search("920", "Второй роман"));
    assert.deepEqual(combined.items.map(({ id }) => id), [920]);
    const nameAsTitle = await searchAdminMediaBrowser(search("", "James Corey"));
    assert.equal(nameAsTitle.totalCount, 0);
  });

  it("protects series and creators used solely as sources, cascades explicit deletes and clears the editor list", async () => {
    const { deleteFranchiseIfEmpty } = await import("../src/db/queries/franchises");
    const { deleteUnlinkedCreator } = await import("../src/db/queries/creator-requests");
    await client!`delete from entry_creators where creator_id=902`;
    assert.equal(await app!.db.transaction((tx) => deleteUnlinkedCreator(tx, 902)), null);
    assert.equal(await deleteFranchiseIfEmpty(903), null);
    await client!`delete from franchises where id=903`;
    await client!`delete from creators where id=902`;
    await client!`delete from media_items where id=901`;
    assert.deepEqual(await queries.getEntrySources(907), []);
    assert.equal((await queries.getEntrySources(902)).some(({ id, type }) => id === 902 && type === "creator"), false);
    assert.deepEqual(await queries.getWorksBasedOn("entry", 901, accessible), []);
    assert.equal(await queries.saveEntrySources(902, []), true);
    assert.deepEqual(await queries.getEntrySources(902), []);
  });

  it("edits reverse links without changing other sources of the selected entries", async () => {
    const otherSource = { type: "creator" as const, id: 901 };
    assert.equal(await queries.saveEntrySources(920, [otherSource]), true);

    assert.equal(await queries.updateWorksBasedOn(902, [920, 904], []), true);
    assert.deepEqual((await queries.getWorksBasedOn("entry", 902, "admin")).map(({ id }) => id).sort(), [903, 904, 920]);
    assert.equal((await queries.getWorksBasedOn("entry", 902, accessible)).some(({ id }) => id === 904), false);
    assert.equal(await queries.updateWorksBasedOn(902, [920], []), true);
    assert.equal(await queries.updateWorksBasedOn(902, [9999], [920]), false);
    assert.deepEqual((await queries.getEntrySources(920)).map(({ type, id }) => ({ type, id })), [
      otherSource, { type: "entry", id: 902 },
    ]);

    assert.equal(await queries.updateWorksBasedOn(902, [], [920]), true);
    assert.deepEqual((await queries.getEntrySources(920)).map(({ type, id }) => ({ type, id })), [otherSource]);
    assert.deepEqual((await queries.getWorksBasedOn("entry", 902, "admin")).map(({ id }) => id).sort(), [903, 904]);
  });

  it("publishes linked records directly for trusted authors and blocks automatic approval for ordinary authors", async () => {
    const { submitAuthorMediaItemForPublication } = await import("../src/db/queries/media-items");
    const { evaluateMediaAutomoderationCheck, autoApproveMediaItem } = await import("../src/lib/automoderation/media-policy");
    const { createAuthorPrivateMediaItemWithLimitCheck: create } = await import("../src/db/operations/author-media-items");
    await client!`insert into authors(id, code, name, access_profile_id) values
      (930, 'source-trusted', 'Доверенный автор', 3), (931, 'source-standard', 'Автор', 2)`;
    await client!`insert into author_access_profile_media_types(access_profile_id, media_type_id)
      select profile.id, media_types.id from media_types cross join author_access_profiles profile
      where profile.id in (2, 3) and media_types.code in ('book', 'film') on conflict do nothing`;
    const form = {
      authorId: 930,
      title: "Новая запись",
      originalTitle: null,
      description: null,
      mediaType: "book" as const,
      franchiseIds: [],
      mediaCarrierId: null,
      releaseYear: null,
      coverUrl: null,
      coverThumbUrl: null,
      coverSource: { provider: null, externalId: null, pageUrl: null },
      limits: { maxDraftMediaItems: null, maxDraftMediaItemsPerDay: null },
    };
    const withSource = {
      ...form,
      code: "new-with-source",
      authorCreationRequestId: "source-create",
      entryRelationship: { direction: "source" as const, targetId: 920 },
    };
    const created = await create(withSource);
    assert.ok(created.ok && created.created);
    assert.deepEqual((await queries.getEntrySources(created.item.id)).map(({ id }) => id), [920]);
    const retry = await create(withSource);
    assert.ok(retry.ok && !retry.created && retry.item.id === created.item.id);

    const reverse = await create({
      ...form,
      authorId: 931,
      code: "new-with-adaptation",
      authorCreationRequestId: "adaptation-create",
      entryRelationship: { direction: "adaptation", targetId: 920 },
    });
    assert.ok(reverse.ok && reverse.created);
    assert.ok((await queries.getEntrySources(920)).some(({ id, type }) => id === reverse.item.id && type === "entry"));
    assert.ok(!(await queries.getEntrySources(920, accessible)).some(({ id, type }) => id === reverse.item.id && type === "entry"));

    const forbidden = { ...withSource, code: "forbidden-source", authorCreationRequestId: "forbidden-create" };
    await assert.rejects(create({ ...forbidden, entryRelationship: { direction: "source", targetId: 904 } }), /invalid-entry-relationship/);
    assert.equal((await client!`select id from media_items where code='forbidden-source'`).length, 0);

    const published = await submitAuthorMediaItemForPublication({
      authorId: 930, mediaItemId: created.item.id, nextStatus: "published",
    });
    assert.equal(published?.publicationStatus, "published");
    assert.ok((await queries.getWorksBasedOn("entry", 920, accessible)).some(({ id }) => id === created.item.id));

    const { mutateMediaItemTag } = await import("../src/db/queries/tags");
    const tag = await mutateMediaItemTag({ mediaItemId: created.item.id, authorId: 930, title: "Уже назначен" });
    const matchingEntries = await queries.searchEntrySourceOptions("entry", "новая запись", null, [], tag.tagId);
    assert.ok(matchingEntries.some(({ id }) => id === reverse.item.id));
    assert.ok(!matchingEntries.some(({ id }) => id === created.item.id));

    const submitted = await submitAuthorMediaItemForPublication({ authorId: 931, mediaItemId: reverse.item.id, nextStatus: "submitted" });
    assert.equal(submitted?.publicationStatus, "submitted");
    const [check] = await client!`insert into automoderation_checks
      (source_event_id, subject_type, subject_key, subject_revision, policy_code, policy_version, mode, status, input_fingerprint)
      select id, 'media-item', aggregate_id, ${submitted!.moderationRevision}, 'media-item-publication', 1, 'enforce', 'running', 'fixture'
      from domain_events where type = 'media.submitted' and aggregate_id = ${String(reverse.item.id)}
      returning id`;
    const evaluation = await evaluateMediaAutomoderationCheck(check.id);
    assert.ok(evaluation && !evaluation.stale);
    assert.equal(evaluation.decision, "NEEDS_REVIEW");
    assert.ok(evaluation.reasonCodes.includes("entry_relationships_present"));
    assert.ok(evaluation.reasonCodes.includes("provider_snapshot_missing"));
    assert.equal(await autoApproveMediaItem({
      checkId: check.id, mediaItemId: reverse.item.id, expectedRevision: submitted!.moderationRevision,
      expectedUpdatedAt: evaluation.expectedUpdatedAt,
    }), null);
  });
});
