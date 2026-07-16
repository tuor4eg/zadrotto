import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("media item franchise moderation migration", () => {
  it("adds independent relation status, author attribution, and a queue index", () => {
    const migration = readFileSync("drizzle/0030_media_item_franchise_moderation.sql", "utf8");

    assert.match(migration, /ADD COLUMN "created_by_author_id" integer/);
    assert.match(migration, /ADD COLUMN "publication_status" "publication_status" DEFAULT 'published' NOT NULL/);
    assert.match(migration, /media_item_franchises_publication_status_idx/);
  });
});

describe("public franchise links", () => {
  it("requires the link itself to be published", () => {
    const mediaQueries = readFileSync("src/db/queries/media-items.ts", "utf8");
    const franchiseQueries = readFileSync("src/db/queries/franchises.ts", "utf8");

    assert.match(
      mediaQueries,
      /'publicationStatus', "media_item_franchises"\."publication_status"/,
    );
    assert.match(
      mediaQueries,
      /"media_item_franchises"\."publication_status" = \$\{PUBLISHED_PUBLICATION_STATUS\}/,
    );
    assert.match(franchiseQueries, /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
  });

  it("passes every existing relation status to the author suggestion dialog", () => {
    const mediaQueries = readFileSync("src/db/queries/media-items.ts", "utf8");
    const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");

    assert.match(mediaQueries, /franchiseLinkStatuses: franchiseLinkStatusesSql\(mediaItems\.id\)/);
    assert.match(mediaPage, /Уже предложена и ожидает проверки/);
  });
});

describe("author franchise submission history", () => {
  it("reads only the author's franchises and links without duplicating an automatically linked new series", () => {
    const franchiseQueries = readFileSync("src/db/queries/franchises.ts", "utf8");

    assert.match(franchiseQueries, /export async function getAuthorFranchiseSubmissions\(authorId: number\)/);
    assert.match(franchiseQueries, /eq\(franchises\.createdByAuthorId, authorId\)/);
    assert.match(franchiseQueries, /eq\(mediaItemFranchises\.createdByAuthorId, authorId\)/);
    assert.match(franchiseQueries, /notExists\(/);
  });
});

describe("new franchise review", () => {
  it("shows the media items that will receive the new series with the same approval", () => {
    const franchiseQueries = readFileSync("src/db/queries/franchises.ts", "utf8");
    const reviewPage = readFileSync("src/app/admin/(protected)/franchise-review/page.tsx", "utf8");

    assert.match(franchiseQueries, /submittedFranchiseMediaItemsSql/);
    assert.match(reviewPage, /Новая серия будет добавлена к записи при одобрении/);
  });
});
