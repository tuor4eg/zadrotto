import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsShikimoriMarkup,
  needsShikimoriDescriptionRefresh,
  sanitizeShikimoriDescription,
} from "@/lib/media/shikimori-description";

describe("Shikimori description normalization", () => {
  for (const tag of ["character", "person", "anime", "manga"]) {
    it(`unwraps ${tag} and leaves its text intact`, () => {
      const input = `  Рэйчел [${tag}=175893]Рахиль[/${tag}] встретила героя.  `;
      assert.equal(sanitizeShikimoriDescription(input), "Рэйчел Рахиль встретила героя.");
      assert.equal(containsShikimoriMarkup(input), true);
      assert.equal(containsShikimoriMarkup(input), true);
    });
  }

  it("preserves whitespace, unknown markup and nested link text", () => {
    const input = " \n[anime=1]Имя [person=2]автора[/person][/anime]  \n[manga=3]Манга[/manga]\n[b]текст[/b] [url=x]ссылка[/url] [character=x] \n";
    const expected = "Имя автора  \nМанга\n[b]текст[/b] [url=x]ссылка[/url] [character=x]";
    assert.equal(sanitizeShikimoriDescription(input), expected);
    assert.equal(sanitizeShikimoriDescription(expected), expected);
    assert.equal(containsShikimoriMarkup(expected), false);
  });

  it("handles empty descriptions and tag-only values", () => {
    assert.equal(sanitizeShikimoriDescription(" [anime=1][/anime] "), "");
    assert.equal(containsShikimoriMarkup(null), false);
    assert.equal(containsShikimoriMarkup(undefined), false);
    assert.equal(containsShikimoriMarkup("[/character]"), true);
  });

  it("refreshes only empty, clearly English or marked-up descriptions", () => {
    for (const value of [null, "  ", "This is a clearly English description.", "[character=1]Рахиль[/character]"]) {
      assert.equal(needsShikimoriDescriptionRefresh(value), true);
    }
    for (const value of ["Коротко", "Описание, исправленное вручную пользователем.", "Русский text mixed", "[b]Описание[/b]"]) {
      assert.equal(needsShikimoriDescriptionRefresh(value), false);
    }
    assert.equal(needsShikimoriDescriptionRefresh(sanitizeShikimoriDescription("[character=1]Рахиль[/character]")), false);
  });
});
