import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync("src/db/schema.ts", "utf8");
const queries = readFileSync("src/db/queries/editorial-collections.ts", "utf8");
const mediaQueries = readFileSync("src/db/queries/media-items.ts", "utf8");
const publicPage = readFileSync("src/app/collections/[slug]/page.tsx", "utf8");
const publicCatalog = readFileSync("src/app/collections/page.tsx", "utf8");
const testHomePage = readFileSync("src/app/test/page.tsx", "utf8");
const archiveFeedQuery = readFileSync("src/db/queries/archive-feed.ts", "utf8");
const archiveFeedView = readFileSync("src/app/test/archive-feed.tsx", "utf8");
const editor = readFileSync("src/app/admin/(protected)/collections/collection-form.tsx", "utf8");
const documentEditor = readFileSync("src/components/admin/editorial-document-editor.tsx", "utf8");
const renderer = readFileSync("src/components/archive/editorial-document-renderer.tsx", "utf8");
const documentQueries = readFileSync("src/db/queries/editorial-documents.ts", "utf8");
const migration = readFileSync("drizzle/0084_editorial_documents.sql", "utf8");
const actions = readFileSync("src/app/admin/(protected)/collections/actions.ts", "utf8");
const imageRoute = readFileSync("src/app/collection-images/[...objectKey]/route.ts", "utf8");
const nginx = readFileSync("deploy/nginx/zadrotto.conf", "utf8");

describe("editorial collection persistence", () => {
  it("stores mixed ordered blocks in a reusable editorial document", () => {
    assert.match(schema, /editorialDocuments = pgTable/);
    assert.match(schema, /editorialDocumentBlocks = pgTable/);
    assert.match(schema, /editorialDocumentBlockTypeEnum/);
    assert.match(schema, /table\.documentId,\s*table\.position/);
    assert.match(schema, /editorial_document_blocks_shape_check/);
    assert.match(schema, /onDelete: "restrict"/);
  });

  it("migrates existing positions and comments before removing the old join table", () => {
    assert.match(migration, /SELECT new_document_id, position, 'media', media_item_id, editorial_comment/);
    assert.ok(migration.indexOf("INSERT INTO editorial_document_blocks") < migration.indexOf('DROP TABLE "editorial_collection_items"'));
  });

  it("creates an immutable unique slug and atomically replaces dense positions", () => {
    assert.match(queries, /createUniqueSlug/);
    assert.match(queries, /slugifyCodePart\(title\)/);
    assert.doesNotMatch(queries, /updateEditorialCollection[\s\S]{0,1200}slug:/);
    assert.match(documentQueries, /blocks\.map\(\(block, position\)/);
    assert.match(queries, /db\.transaction/);
  });

  it("validates block limits and empty content before replacement", () => {
    assert.match(documentQueries, /MAX_EDITORIAL_DOCUMENT_BLOCKS/);
    assert.match(documentQueries, /MAX_EDITORIAL_DOCUMENT_MEDIA_BLOCKS/);
    assert.match(documentQueries, /heading-empty/);
    assert.match(documentQueries, /text-empty/);
    assert.match(documentQueries, /pg_advisory_xact_lock/);
  });

  it("requires at least one published item before publication", () => {
    assert.match(queries, /status === "published"/);
    assert.match(queries, /if \(totalCount === 0\) throw new Error\("empty"\)/);
    assert.match(queries, /publishedCount !== totalCount/);
  });
});

describe("collection surfaces", () => {
  it("keeps the public route published-only and uses a shared renderer", () => {
    assert.match(queries, /getPublishedEditorialCollectionBySlug/);
    assert.match(queries, /eq\(editorialCollections\.publicationStatus, "published"\)/);
    assert.match(publicPage, /EditorialCollectionView/);
    assert.match(publicPage, /dynamic = "force-dynamic"/);
    assert.match(publicCatalog, /dynamic = "force-dynamic"/);
    assert.match(renderer, /flushMediaGroup/);
    assert.match(renderer, /whitespace-pre-wrap/);
    assert.match(renderer, /mediaNumber \+= 1/);
  });

  it("shows published collections as wide image cards on the test home page", () => {
    assert.match(testHomePage, /getPublishedEditorialCollections/);
    assert.match(testHomePage, /EditorialCollectionsStrip/);
    assert.match(testHomePage, /aspect-video/);
    assert.match(testHomePage, /bg-gradient-to-t from-black\/90/);
    assert.match(testHomePage, /collection\.itemsCount.*записей/);
  });

  it("includes newly published collections in the test archive feed", () => {
    assert.match(archiveFeedQuery, /editorialCollections\.publicationStatus/);
    assert.match(archiveFeedQuery, /kind: "collection"/);
    assert.match(archiveFeedQuery, /resolveCollectionImageUrl/);
    assert.match(archiveFeedQuery, /`\/collections\/\$\{item\.slug\}`/);
    assert.match(archiveFeedView, /collection: \{ icon: Library, label: "Подборка" \}/);
  });

  it("supports bulk browsing and accessible ordering", () => {
    assert.match(editor, /AdminMediaBrowser/);
    assert.match(editor, /createPortal/);
    assert.match(editor, /aria-modal="true"/);
    assert.match(editor, /Добавить записи/);
    assert.match(editor, /EditorialDocumentEditor/);
    assert.match(documentEditor, /DndContext/);
    assert.match(documentEditor, /Переместить.*выше/);
    assert.match(documentEditor, /Переместить.*ниже/);
    assert.match(documentEditor, /Добавить заголовок/);
    assert.match(documentEditor, /Добавить текст/);
  });

  it("blocks unpublishing and deleting referenced archive records", () => {
    const references = mediaQueries.match(/collection-reference/g) ?? [];
    assert.ok(references.length >= 2);
    assert.match(mediaQueries, /editorialDocumentBlocks\.mediaItemId/);
  });

  it("serves collection covers through the configured internal nginx location", () => {
    assert.match(imageRoute, /X-Accel-Redirect/);
    assert.match(imageRoute, /\/_collection-images\//);
    assert.match(nginx, /location \^~ \/_collection-images\/ \{[\s\S]*?internal;[\s\S]*?proxy_pass/);
  });

  it("does not delete a successfully saved image when the action redirects", () => {
    const redirectGuard = 'if (error && typeof error === "object" && "digest" in error) throw error;';
    const firstGuard = actions.indexOf(redirectGuard);
    const firstCleanup = actions.indexOf("deleteCollectionImageBestEffort(uploaded)", firstGuard);
    assert.ok(firstGuard >= 0);
    assert.ok(firstCleanup > firstGuard);
    const secondGuard = actions.indexOf(redirectGuard, firstGuard + redirectGuard.length);
    const secondCleanup = actions.indexOf("deleteCollectionImageBestEffort(uploaded)", secondGuard);
    assert.ok(secondGuard > firstGuard);
    assert.ok(secondCleanup > secondGuard);
  });
});
