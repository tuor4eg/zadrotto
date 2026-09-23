import assert from "node:assert/strict";
import test from "node:test";

import {
  inlineMarkupToPlainText,
  parseInlineMarkup,
  serializeInlineEntity,
} from "../src/lib/inline-mentions/markup";

test("parses semantic inline mentions and preserves surrounding text", () => {
  assert.deepEqual(parseInlineMarkup("Мне нравится [[title:123|Ведьмак 3]] больше."), [
    { type: "text", value: "Мне нравится " },
    { type: "entity", entityType: "title", id: "123", label: "Ведьмак 3" },
    { type: "text", value: " больше." },
  ]);
});

test("serializer round-trips labels with pipes, slashes and brackets", () => {
  const marker = serializeInlineEntity({ entityType: "title", id: "abc:123", label: "A | B \\ C ]]" });
  assert.deepEqual(parseInlineMarkup(marker), [
    { type: "entity", entityType: "title", id: "abc:123", label: "A | B \\ C ]]" },
  ]);
});

test("malformed outer markers do not hide later valid markers", () => {
  const value = "broken [[oops [[title:1|ok]] tail [[tag:rpg|RPG]]";
  assert.deepEqual(parseInlineMarkup(value), [
    { type: "text", value: "broken [[oops [[title:1|ok]] tail " },
    { type: "entity", entityType: "tag", id: "rpg", label: "RPG" },
  ]);
});

test("plain-text projection replaces only valid markers", () => {
  assert.equal(
    inlineMarkupToPlainText("До [[title:1|<script>alert(1)</script>]] после [[broken]]"),
    "До <script>alert(1)</script> после [[broken]]",
  );
});

test("plain legacy reviews keep a single fast-path text node", () => {
  assert.deepEqual(parseInlineMarkup("Обычная старая рецензия"), [
    { type: "text", value: "Обычная старая рецензия" },
  ]);
});
