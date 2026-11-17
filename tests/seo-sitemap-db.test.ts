import assert from "node:assert/strict";
import { test } from "node:test";

test("sitemap SQL returns only guest-visible identities and existing sparse buckets", {
  skip: process.env.SEO_SITEMAP_DB_TEST !== "1",
}, async () => {
  const { default: postgres } = await import("postgres");
  const originalUrl = process.env.DATABASE_URL!;
  const originalMax = process.env.DATABASE_MAX_CONNECTIONS;
  const admin = postgres(originalUrl, { max: 1, prepare: false, onnotice() {} });
  const schema = `seo_sitemap_${process.pid}_${Date.now()}`;
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await admin.unsafe(`create schema ${schema}`);
    const url = new URL(originalUrl);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_MAX_CONNECTIONS = "1";
    const { getDbClient } = await import("../src/db");
    client = getDbClient();
    await client.unsafe(`
      create table media_types(code text primary key,is_publicly_available boolean);
      create table media_items(id integer primary key,code text,media_type text,publication_status text,updated_at timestamptz default '2026-01-02T03:04:05Z');
      create table authors(id integer primary key);
      create table contributions(id integer primary key,type text,status text,author_id integer,primary_media_item_id integer,updated_at timestamptz default '2026-01-02T03:04:05Z');
      create table contribution_reviews(contribution_id integer primary key);
      create table editorial_collections(id integer primary key,slug text,publication_status text,updated_at timestamptz);
      create table franchises(id integer primary key,code text,parent_id integer,publication_status text,updated_at timestamptz);
      create table genres(id integer primary key,slug text,is_active boolean,replacement_franchise_id integer,updated_at timestamptz);
      create table platforms(id integer primary key,slug text,is_active boolean,updated_at timestamptz);
      create table media_item_genres(media_item_id integer,genre_id integer);
      create table media_item_platforms(media_item_id integer,platform_id integer);
      create table media_item_franchises(media_item_id integer,franchise_id integer,publication_status text);
      create table creators(id integer primary key,slug text,updated_at timestamptz);
      create table creator_roles(id integer primary key,code text);
      create table entry_creators(entry_id integer,creator_id integer,role_id integer);
      create table entry_creator_pseudonyms(entry_id integer,creator_id integer,role_id integer);
      create table creator_relations(source_creator_id integer,target_creator_id integer,relation_type text);
      insert into media_types values ('game',true),('book',true),('hidden',false);
      insert into media_items(id,code,media_type,publication_status) values
        (1,'visible-game','game','published'),(2,'draft-game','game','private'),
        (3,'hidden-type','hidden','published'),(4,'visible-book','book','published'),
        (10001,'next-bucket','game','published'),(50001,'hidden-sparse-bucket','hidden','published'),
        (30001,'sparse-bucket','game','published');
      insert into authors values(1);
      insert into contributions(id,type,status,author_id,primary_media_item_id) values
        (1,'review','published',1,1),(2,'review','draft',1,1),(3,'review','published',1,2),
        (4,'review','published',1,3),(5,'other','published',1,1),(6,'review','published',1,1);
      insert into contribution_reviews values(1),(2),(3),(4),(5);
      insert into editorial_collections values(1,'public','published',null),(2,'private','private',null);
      insert into franchises values(1,'public',null,'published',null),(2,'private',null,'private',null);
      insert into genres values(1,'visible',true,null,null),(2,'inactive',false,null,null),
        (3,'hidden-type',true,null,null),(4,'draft-parent',true,null,null),(5,'replaced',true,1,null);
      insert into media_item_genres values(1,1),(1,2),(3,3),(2,4),(1,5);
      insert into media_item_franchises values(1,1,'published');
      insert into platforms values(1,'visible',true,null),(2,'inactive',false,null),
        (3,'hidden-type',true,null),(4,'draft-parent',true,null),(5,'book-only',true,null);
      insert into media_item_platforms values(1,1),(1,2),(3,3),(2,4),(4,5);
      insert into creators values(1,'direct',null),(2,'draft-only',null),(3,'hidden-type',null),
        (4,'pseudonym',null),(5,'writer-target',null),(6,'unlinked',null),(7,'wrong-role-pseudonym',null);
      insert into creator_roles values(1,'writer'),(2,'artist');
      insert into entry_creators values(1,1,1),(2,2,1),(3,3,1);
      insert into entry_creator_pseudonyms values(4,4,1),(1,7,2);
      insert into creator_relations values(4,5,'pseudonym_of');
    `);
    const { getSitemapEntries, getSitemapBuckets } = await import("../src/db/queries/seo-sitemap");
    const expected = {
      media: ["/media/visible-game", "/media/visible-book"], reviews: ["/reviews/1"],
      collections: ["/collections/public"], series: ["/archive?series=public"],
      genres: ["/archive?genre=visible"], platforms: ["/archive?platform=visible"],
      creators: ["/archive?creator=direct", "/archive?creator=pseudonym", "/archive?creator=writer-target"],
    } as const;
    for (const category of Object.keys(expected) as (keyof typeof expected)[]) {
      const entries = await getSitemapEntries(category, 0);
      assert.deepEqual(entries.map(({ url }) => url), expected[category], category);
    }
    const media = await getSitemapEntries("media", 0);
    assert.equal(new Date(media[0].updatedAt).toISOString(), "2026-01-02T03:04:05.000Z");
    assert.deepEqual((await getSitemapEntries("media", 1)).map(({ url }) => url), ["/media/next-bucket"]);
    assert.deepEqual(await getSitemapEntries("media", 2), []);
    assert.deepEqual((await getSitemapEntries("media", 3)).map(({ url }) => url), ["/media/sparse-bucket"]);
    assert.deepEqual(await getSitemapBuckets(), [
      { category: "media", page: 0 }, { category: "media", page: 1 }, { category: "media", page: 3 },
      ...(["reviews", "collections", "series", "genres", "platforms", "creators"] as const).map((category) => ({ category, page: 0 })),
    ]);
  } finally {
    await client?.end({ timeout: 1 });
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await admin.end({ timeout: 1 });
    process.env.DATABASE_URL = originalUrl;
    if (originalMax === undefined) delete process.env.DATABASE_MAX_CONNECTIONS;
    else process.env.DATABASE_MAX_CONNECTIONS = originalMax;
  }
});
