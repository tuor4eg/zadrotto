import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMediaItemDisplayTitles } from "../src/lib/media/display-titles";

describe("public media display titles", () => {
  it("preserves Cyrillic and mixed titles", () => {
    for (const title of ["Ёжик", "S.T.A.L.K.E.R.: Тень Чернобыля"]) {
      assert.equal(resolveMediaItemDisplayTitles({ title, aliases: ["Другое"] }).displayTitle, title);
    }
  });
  it("selects the first Cyrillic alias and preserves all other aliases in order", () => {
    const input = Object.freeze({ title: "English", originalTitle: "Original", aliases: Object.freeze(["Latin", " Русское ", "Другое"]) });
    assert.deepEqual(resolveMediaItemDisplayTitles(input), {
      displayTitle: "Русское", displayOriginalTitle: "Original", displayAliases: ["Latin", "Другое"],
    });
    assert.deepEqual(input.aliases, ["Latin", " Русское ", "Другое"]);
  });
  it("falls back to title without aliases or a Cyrillic alias", () => {
    assert.equal(resolveMediaItemDisplayTitles({ title: "English" }).displayTitle, "English");
    assert.equal(resolveMediaItemDisplayTitles({ title: "English", aliases: ["", "  ", "Latin"] }).displayTitle, "English");
    assert.deepEqual(resolveMediaItemDisplayTitles({ title: "", originalTitle: " ", aliases: [] }), {
      displayTitle: "", displayOriginalTitle: null, displayAliases: [],
    });
  });
  it("hides normalized duplicates", () => {
    for (const originalTitle of ["English   Title", " english title "]) {
      assert.equal(resolveMediaItemDisplayTitles({ title: "English Title", originalTitle }).displayOriginalTitle, null);
    }
    assert.deepEqual(resolveMediaItemDisplayTitles({ title: "Ёжик", aliases: ["ежик", " ЁЖИК ", "Другое"] }).displayAliases, ["Другое"]);
  });
  it("uses a Cyrillic original as the main title after title and aliases", () => {
    assert.deepEqual(resolveMediaItemDisplayTitles({ title: "English", originalTitle: " Русское ", aliases: ["Latin"] }), {
      displayTitle: "Русское", displayOriginalTitle: null, displayAliases: ["Latin"],
    });
    assert.equal(resolveMediaItemDisplayTitles({ title: "English", originalTitle: "Русское" }).displayTitle, "Русское");
    assert.equal(resolveMediaItemDisplayTitles({ title: "Название", originalTitle: "Русское" }).displayTitle, "Название");
    assert.equal(resolveMediaItemDisplayTitles({ title: "English", originalTitle: "Русское", aliases: ["Название"] }).displayTitle, "Название");
    assert.equal(resolveMediaItemDisplayTitles({ title: "Название", originalTitle: "Русское" }).displayOriginalTitle, null);
    assert.equal(resolveMediaItemDisplayTitles({ title: "English", originalTitle: "Русское", aliases: ["Название"] }).displayOriginalTitle, null);
  });
  it("shows a non-Cyrillic original after choosing an alias", () => {
    assert.equal(resolveMediaItemDisplayTitles({ title: "English", originalTitle: "English", aliases: ["Русское"] }).displayOriginalTitle, "English");
    assert.equal(resolveMediaItemDisplayTitles({ title: "English", originalTitle: "日本語" }).displayOriginalTitle, "日本語");
  });
});
