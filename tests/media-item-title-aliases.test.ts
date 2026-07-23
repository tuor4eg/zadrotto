import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  MAX_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  MIN_MEDIA_ITEM_TITLE_ALIAS_LIMIT,
  normalizeMediaItemTitleAliases,
  parseMediaItemTitleAliasLimit,
} from "../src/lib/media/title-aliases";

const adminActions = readFileSync("src/app/admin/(protected)/media/actions.ts", "utf8");
const authorActions = readFileSync("src/app/author/(protected)/media/actions.ts", "utf8");
const aliasFields = readFileSync("src/components/ui/media-title-alias-fields.tsx", "utf8");
const details = readFileSync("src/app/media-item-details.tsx", "utf8");
const mediaQueries = readFileSync("src/db/queries/media-items.ts", "utf8");
const settingsForm = readFileSync(
  "src/app/admin/(protected)/settings/archive/archive-settings-form.tsx",
  "utf8",
);

describe("media item title aliases", () => {
  it("trims, removes empty and case-insensitive duplicates, and excludes canonical titles", () => {
    assert.deepEqual(
      normalizeMediaItemTitleAliases(
        ["  Jumanji  ", "", "Джуманджи", "JUMANJI", " Джуманджи: Игра "],
        { title: "Джуманджи", originalTitle: "Jumanji" },
      ),
      ["Джуманджи: Игра"],
    );
    assert.deepEqual(
      normalizeMediaItemTitleAliases([" First ", "first", "SECOND", " second "]),
      ["First", "SECOND"],
    );
  });

  it("accepts only integer limits within the configured boundaries", () => {
    assert.equal(parseMediaItemTitleAliasLimit(MIN_MEDIA_ITEM_TITLE_ALIAS_LIMIT), 1);
    assert.equal(parseMediaItemTitleAliasLimit(String(MAX_MEDIA_ITEM_TITLE_ALIAS_LIMIT)), 10);

    for (const value of [0, 11, 1.5, "", "many", null, undefined]) {
      assert.equal(parseMediaItemTitleAliasLimit(value), null);
    }
  });

  it("uses the normalizer and enforces the server-side limit for admin and author writes", () => {
    for (const source of [adminActions, authorActions]) {
      assert.match(source, /formData\.getAll\("titleAliases"\)/);
      assert.match(source, /normalizeMediaItemTitleAliases\(/);
      assert.match(source, /form\.value\.aliases\.length > maxTitleAliases/);
      assert.match(source, /too-many-aliases-\$\{maxTitleAliases\}/);
    }
  });

  it("keeps UI controls, persisted aliases, search, and dossier output connected", () => {
    assert.match(aliasFields, /aliases\.length >= limit/);
    assert.match(aliasFields, /name="titleAliases"/);
    assert.match(aliasFields, /Альтернативное название \{index \+ 1\}/);
    assert.match(settingsForm, /Максимум альтернативных названий/);

    assert.match(mediaQueries, /aliases: mediaItemTitleAliasesSql\(\)/);
    assert.match(mediaQueries, /from\(mediaItemTitleAliases\)/);
    assert.match(mediaQueries, /lower\(\$\{mediaItemTitleAliases\.value\}\) like \$\{pattern\}/);
    assert.match(details, /Также известно как: \{item\.aliases\?\.join\(", "\)\}/);
  });
});
