import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveMediaTypeEnabled } from "../src/lib/media/types";

const read = (path: string) => readFileSync(path, "utf8");

function getExportedFunctionSource(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  const nextFunction = source.indexOf("\nexport async function ", start + 1);

  assert.notEqual(start, -1, `Missing ${name}`);

  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

describe("media type effective visibility", () => {
  const publicDefaultOn = {
    enabledByDefault: true,
    isPubliclyAvailable: true,
  };
  const publicDefaultOff = {
    enabledByDefault: false,
    isPubliclyAvailable: true,
  };

  it("uses the current default when an author has no override", () => {
    assert.equal(resolveMediaTypeEnabled(publicDefaultOn), true);
    assert.equal(resolveMediaTypeEnabled(publicDefaultOff), false);
    assert.equal(resolveMediaTypeEnabled(
      { ...publicDefaultOff, enabledByDefault: true },
      null,
    ), true);
  });

  it("allows an author to override either default", () => {
    assert.equal(resolveMediaTypeEnabled(publicDefaultOn, { isEnabled: false }), false);
    assert.equal(resolveMediaTypeEnabled(publicDefaultOff, { isEnabled: true }), true);
  });

  it("never exposes a media type that is unavailable in the public archive", () => {
    const unavailable = {
      enabledByDefault: true,
      isPubliclyAvailable: false,
    };

    assert.equal(resolveMediaTypeEnabled(unavailable), false);
    assert.equal(resolveMediaTypeEnabled(unavailable, { isEnabled: true }), false);
  });
});

describe("media type visibility persistence contracts", () => {
  it("defines defaults and sparse per-author overrides in schema and migration", () => {
    const schema = read("src/db/schema.ts");
    const migration = read("drizzle/0041_media_type_visibility.sql");

    assert.match(schema, /isPubliclyAvailable: boolean\("is_publicly_available"\)\.default\(false\)\.notNull\(\)/);
    assert.match(schema, /enabledByDefault: boolean\("enabled_by_default"\)\.default\(true\)\.notNull\(\)/);
    assert.match(schema, /authorMediaTypeSettings = pgTable\([\s\S]*"author_media_type_settings"/);
    assert.match(schema, /references\(\(\) => authors\.id, \{ onDelete: "cascade" \}\)/);
    assert.match(schema, /references\(\(\) => mediaTypes\.id, \{ onDelete: "cascade" \}\)/);
    assert.match(schema, /isEnabled: boolean\("is_enabled"\)\.notNull\(\)/);
    assert.match(
      schema,
      /primaryKey\(\{[\s\S]*columns: \[table\.authorId, table\.mediaTypeId\][\s\S]*author_media_type_settings_pk/,
    );

    assert.match(migration, /ADD COLUMN "is_publicly_available" boolean DEFAULT false NOT NULL/i);
    assert.match(migration, /ADD COLUMN "enabled_by_default" boolean DEFAULT true NOT NULL/i);
    assert.match(
      migration,
      /UPDATE "media_types"[\s\S]*"is_publicly_available" = true[\s\S]*"enabled_by_default" = true/i,
    );
    assert.match(migration, /CREATE TABLE "author_media_type_settings"/i);
    assert.match(migration, /PRIMARY KEY \("author_id", "media_type_id"\)/i);
    assert.match(migration, /FOREIGN KEY \("author_id"\)[\s\S]*ON DELETE cascade/i);
    assert.match(migration, /FOREIGN KEY \("media_type_id"\)[\s\S]*ON DELETE cascade/i);
  });

  it("stores only values that differ from defaults and reset removes all overrides", () => {
    const queries = read("src/db/queries/media-types.ts");

    assert.match(
      queries,
      /defaultById = new Map\([\s\S]*enabledByDefault[\s\S]*settings\.filter\([\s\S]*defaultById\.get\(mediaTypeId\) !== isEnabled/,
    );
    assert.match(
      queries,
      /delete\(authorMediaTypeSettings\)[\s\S]*inArray\(authorMediaTypeSettings\.mediaTypeId, mediaTypeIds\)/,
    );
    assert.match(queries, /if \(overrides\.length > 0\)[\s\S]*insert\(authorMediaTypeSettings\)/);
    assert.match(
      queries,
      /resetAuthorMediaTypeOverrides[\s\S]*delete\(authorMediaTypeSettings\)[\s\S]*eq\(authorMediaTypeSettings\.authorId, authorId\)/,
    );
  });
});

describe("media type access contracts", () => {
  it("defines additive guest and access-profile grants without seeded profile mappings", () => {
    const schema = read("src/db/schema.ts");
    const migration = read("drizzle/0042_media_type_guest_access.sql");

    assert.match(
      schema,
      /isAvailableToGuests: boolean\("is_available_to_guests"\)\.default\(false\)\.notNull\(\)/,
    );
    assert.match(
      schema,
      /authorAccessProfileMediaTypes = pgTable\([\s\S]*"author_access_profile_media_types"/,
    );
    assert.match(
      schema,
      /columns: \[table\.accessProfileId, table\.mediaTypeId\][\s\S]*author_access_profile_media_types_pk/,
    );
    assert.match(migration, /ADD COLUMN "is_available_to_guests" boolean DEFAULT false NOT NULL/i);
    assert.match(migration, /UPDATE "media_types" SET "is_available_to_guests" = true/i);
    assert.match(migration, /CREATE TABLE "author_access_profile_media_types"/i);
    assert.doesNotMatch(migration, /INSERT INTO "author_access_profile_media_types"|CROSS JOIN/i);
  });

  it("makes guest access a baseline that profiles can only extend", () => {
    const queries = read("src/db/queries/media-types.ts");
    const source = getExportedFunctionSource(queries, "getAccessibleMediaTypeOptions");

    assert.match(
      source,
      /authorId === undefined[\s\S]*eq\(mediaTypes\.isAvailableToGuests, true\)/,
    );
    assert.match(
      source,
      /or\([\s\S]*eq\(mediaTypes\.isAvailableToGuests, true\)[\s\S]*exists\(/,
    );
    assert.match(
      source,
      /eq\(authors\.id, authorId\)[\s\S]*eq\(authorAccessProfileMediaTypes\.mediaTypeId, mediaTypes\.id\)/,
    );
    assert.match(source, /eq\(mediaTypes\.isPubliclyAvailable, true\)/);
  });

  it("applies personal preferences only after access has been resolved", () => {
    const queries = read("src/db/queries/media-types.ts");
    const accessible = getExportedFunctionSource(queries, "getAccessibleMediaTypeOptions");
    const effective = getExportedFunctionSource(queries, "getEffectiveMediaTypeOptions");

    assert.doesNotMatch(accessible, /authorMediaTypeSettings/);
    assert.match(effective, /getAccessibleMediaTypeOptions\(authorId\)/);
    assert.match(effective, /authorMediaTypeSettings\.isEnabled/);
    assert.match(effective, /where\(inArray\(mediaTypes\.id, accessibleIds\)\)/);
  });

  it("preserves dormant grants while replacing only current non-guest grants", () => {
    const queries = read("src/db/queries/author-access-profiles.ts");
    const source = getExportedFunctionSource(queries, "updateAuthorAccessProfile");

    assert.match(source, /eq\(mediaTypes\.isAvailableToGuests, false\)[\s\S]*nonGuestIds/);
    assert.match(
      source,
      /delete\(authorAccessProfileMediaTypes\)[\s\S]*inArray\(authorAccessProfileMediaTypes\.mediaTypeId, nonGuestIds\)/,
    );
    assert.match(source, /insert\(authorAccessProfileMediaTypes\)/);
  });

  it("renders guest grants as checked immutable profile permissions", () => {
    const form = read("src/app/admin/(protected)/access-profiles/access-profile-form.tsx");

    assert.match(
      form,
      /defaultChecked=\{[\s\S]*mediaType\.isAvailableToGuests[\s\S]*values\?\.mediaTypeIds/,
    );
    assert.match(form, /disabled=\{mediaType\.isAvailableToGuests\}/);
    assert.match(form, /Гостевые типы доступны всегда/);
  });
});

describe("media type visibility query boundaries", () => {
  it("applies enabled codes to public catalog rows, counts, series, and related lists", () => {
    const mediaItemsQuery = read("src/db/queries/media-items.ts");
    const franchisesQuery = read("src/db/queries/franchises.ts");

    for (const functionName of [
      "getCatalogMediaItems",
      "getCatalogMediaTypeCounts",
      "getOtherMediaItemsFromFranchises",
    ]) {
      assert.match(
        getExportedFunctionSource(mediaItemsQuery, functionName),
        /enabledMediaTypeCodes/,
      );
    }

    for (const functionName of [
      "searchPublishedMediaItemsForFranchise",
      "getPublishedFranchiseTree",
      "getMediaItemsByFranchiseId",
    ]) {
      assert.match(
        getExportedFunctionSource(franchisesQuery, functionName),
        /enabledMediaTypeCodes/,
      );
    }

    const treeSource = getExportedFunctionSource(
      franchisesQuery,
      "getPublishedFranchiseTree",
    );
    assert.match(treeSource, /node\.mediaItemsCount = ids\.size/);
    assert.match(
      treeSource,
      /removeEmptyBranches[\s\S]*node\.mediaItemsCount > 0[\s\S]*return removeEmptyBranches\(roots\)/,
    );
  });

  it("uses a deny-all condition when no media type is enabled", () => {
    const mediaTypesQuery = read("src/db/queries/media-types.ts");

    assert.match(
      mediaTypesQuery,
      /if \(enabledMediaTypeCodes\.length === 0\) \{[\s\S]*return sql<boolean>`false`/,
    );
  });

  it("uses access rather than personal visibility for direct records and mutations", () => {
    const mediaItemsQuery = read("src/db/queries/media-items.ts");
    for (const functionName of [
      "canViewMediaItemCover",
      "getMediaItemIdentityByCode",
      "getPublicMediaItemMetadataByCode",
      "getMediaItemIdentityForAuthorRating",
      "getMediaItemByCode",
    ]) {
      const source = getExportedFunctionSource(mediaItemsQuery, functionName);
      assert.match(source, /accessibleMediaTypeCodes/);
      assert.doesNotMatch(source, /enabledMediaTypeCodes/);
    }

    for (const path of [
      "src/app/media/[code]/page.tsx",
      "src/app/covers/[...objectKey]/route.ts",
      "src/app/ratings/actions.ts",
      "src/app/media/franchise-actions.ts",
      "src/app/series/[code]/actions.ts",
    ]) {
      assert.match(read(path), /getAccessibleMediaTypeCodes/);
    }

    for (const path of [
      "src/app/api/cover-candidates/route.ts",
      "src/app/api/media-item-duplicates/route.ts",
      "src/app/api/media-title-candidates/route.ts",
      "src/app/api/media-title-metadata/route.ts",
    ]) {
      const source = read(path);
      assert.match(source, /getAccessibleMediaTypeCodes\(author\.id\)/);
      assert.match(source, /\.includes\(mediaType\)/);
    }

    const authorMediaActions = read("src/app/author/(protected)/media/actions.ts");
    assert.match(
      authorMediaActions,
      /canAuthorCreateMediaType[\s\S]*getAccessibleMediaTypeCodes\(authorId\)/,
    );
  });

  it("uses enabled types for author lists and summaries", () => {
    const mediaItemsQuery = read("src/db/queries/media-items.ts");
    const reviewsQuery = read("src/db/queries/contribution-reviews.ts");
    const ratingsQuery = read("src/db/queries/ratings.ts");

    for (const [source, functionName] of [
      [mediaItemsQuery, "getAuthorMediaItems"],
      [reviewsQuery, "getAuthorReviews"],
      [reviewsQuery, "getAuthorReviewSummary"],
      [reviewsQuery, "searchPublishedMediaItemsForReview"],
      [ratingsQuery, "getAuthorRatingSummary"],
    ]) {
      const functionSource = getExportedFunctionSource(source, functionName);
      assert.match(functionSource, /enabledMediaTypeCodes/);
      assert.match(functionSource, /getMediaTypeCodeFilterSql/);
    }

    const authorMediaPage = read("src/app/author/(protected)/media/page.tsx");
    assert.match(authorMediaPage, /getEffectiveMediaTypeOptions\(author\.id\)/);
    assert.match(authorMediaPage, /filter\(\(\{ isEnabled \}\) => isEnabled\)/);
    assert.doesNotMatch(authorMediaPage, /get(?:All)?MediaTypeOptions\(\)/);
  });

  it("uses accessible types for direct review selection and editing", () => {
    const reviewsQuery = read("src/db/queries/contribution-reviews.ts");

    for (const functionName of [
      "getPublishedMediaItemForReview",
      "getAuthorReviewForEdit",
    ]) {
      const source = getExportedFunctionSource(reviewsQuery, functionName);
      assert.match(source, /accessibleMediaTypeCodes/);
      assert.match(source, /getMediaTypeCodeFilterSql/);
      assert.doesNotMatch(source, /enabledMediaTypeCodes/);
    }

    for (const path of [
      "src/app/author/(protected)/reviews/new/page.tsx",
      "src/app/author/(protected)/reviews/[id]/edit/page.tsx",
      "src/app/author/(protected)/reviews/actions.ts",
    ]) {
      assert.match(read(path), /getAccessibleMediaTypeCodes\(author\.id\)/);
    }
  });

  it("keeps administrative queries and forms outside author scopes", () => {
    const adminPage = read("src/app/admin/(protected)/media/page.tsx");

    assert.match(adminPage, /get(?:All)?MediaTypeOptions\(\)/);
    assert.doesNotMatch(
      adminPage,
      /getAccessibleMediaTypeOptions|getEffectiveMediaTypeOptions|getEnabledMediaTypeCodes/,
    );
  });

  it("prevents personal preferences from granting access", () => {
    const action = read("src/app/author/(protected)/settings/media-types/actions.ts");

    assert.match(action, /getAccessibleMediaTypeOptions\(author\.id\)/);
    assert.match(
      action,
      /mediaTypeIds\.length !== accessibleIds\.size[\s\S]*mediaTypeIds\.some\(\(id\) => !accessibleIds\.has\(id\)\)/,
    );
  });

  it("uses accessible types for creation and retains a hidden accessible current type on edit", () => {
    const createPage = read("src/app/author/(protected)/media/new/page.tsx");
    const editPage = read("src/app/author/(protected)/media/[id]/edit/page.tsx");

    assert.match(createPage, /getAccessibleMediaTypeOptions\(author\.id\)/);
    assert.doesNotMatch(createPage, /getEnabledMediaTypeCodes/);
    assert.match(editPage, /getAccessibleMediaTypeOptions\(author\.id\)/);
    assert.match(editPage, /getEffectiveMediaTypeOptions\(author\.id\)/);
    assert.match(editPage, /if \(!currentMediaType\) \{[\s\S]*notFound\(\)/);
    assert.match(
      editPage,
      /!enabledMediaTypes\.some[\s\S]*\[\.\.\.enabledMediaTypes, currentMediaType\]/,
    );
  });

  it("does not expose covers of globally unavailable published records", () => {
    const mediaItemsQuery = read("src/db/queries/media-items.ts");
    const coverLookup = getExportedFunctionSource(
      mediaItemsQuery,
      "canViewMediaItemCover",
    );

    assert.match(coverLookup, /eq\(mediaTypes\.isPubliclyAvailable, true\)/);
    assert.match(coverLookup, /\.innerJoin\(mediaTypes, eq\(mediaTypes\.code, mediaItems\.mediaType\)\)/);
  });
});
