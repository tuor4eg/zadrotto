import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getSchema } from "@tiptap/core"
import { EditorState } from "@tiptap/pm/state"

import { ReviewBody } from "../src/components/reviews/review-body"
import { parseInlineMarkup, serializeInlineEntity } from "../src/lib/inline-mentions/markup"
import { isLegacyReviewFormatConversion, isReviewLinkAllowed, reviewBodyEntities, reviewBodyToDocument, reviewBodyToPlainText, reviewDocumentToMarkdown, reviewExtensions, updateReviewMentionLabel } from "../src/lib/reviews/body"
import { parseReviewFormInput } from "../src/lib/forms/contribution-review"

function convertLegacy(body: string) {
  return reviewDocumentToMarkdown(reviewBodyToDocument(body, "plain"))
}

describe("review Markdown compatibility", () => {
  it("edits a mention caption without replacing its record ID or surrounding text", () => {
    const schema = getSchema(reviewExtensions)
    const doc = schema.nodeFromJSON(reviewBodyToDocument("До [[title:123|Название записи]] после", "markdown"))
    const state = EditorState.create({ schema, doc })
    let position = -1
    doc.descendants((node, pos) => { if (node.type.name === "mention") position = pos })
    const tr = state.tr
    const label = "произвольный *текст* с ] и \\"
    assert.equal(updateReviewMentionLabel(tr, position, label), true)
    const saved = reviewDocumentToMarkdown(tr.doc.toJSON())
    assert.deepEqual(reviewBodyEntities(saved, "markdown"), [{ type: "entity", entityType: "title", id: "123", label }])
    assert.equal(reviewBodyToPlainText(saved, "markdown"), `До ${label} после`)
    assert.equal(updateReviewMentionLabel(tr, position, "  "), false)
    assert.equal(updateReviewMentionLabel(tr, 1, "другой текст"), false)
    assert.equal(reviewDocumentToMarkdown(reviewBodyToDocument(saved, "markdown")), saved)
  })
  it("preserves literal old text, blank lines, Markdown symbols and HTML entities", () => {
    const text = "Начало *буквально* **тоже** ~~не зачёркнуто~~ _слово_\nСтрока\n\n\nАбзац <script>alert(1)</script> &nbsp; &amp; [[broken]]"
    const markdown = convertLegacy(text)
    assert.equal(reviewBodyToPlainText(markdown, "markdown"), text)
    const html = renderToStaticMarkup(ReviewBody({ body: markdown, format: "markdown" }))
    assert.doesNotMatch(html, /<script|<strong|<em>|<s>/)
    assert.match(html, /&lt;script&gt;/)
  })

  it("keeps literal block prefixes from becoming headings, lists, rules or code", () => {
    for (const text of ["# Заголовок", "## Ещё заголовок", "1. Пункт", "2) Пункт", "- Пункт", "+ Пункт", "> Цитата", "---", "===", "    Код", "\tКод", "| A | B |", "Обычный текст\n# Строка"]) {
      const markdown = convertLegacy(text)
      assert.equal(reviewBodyToPlainText(markdown, "markdown"), text, JSON.stringify({ text, markdown }))
      assert.equal(reviewDocumentToMarkdown(reviewBodyToDocument(markdown, "markdown")), markdown)
    }
  })

  it("distinguishes a format-only conversion from editing content or adding formatting", () => {
    const plain = "# Буквальный заголовок\n[[title:5|Запись]]"
    const converted = convertLegacy(plain)
    assert.equal(isLegacyReviewFormatConversion(plain, converted), true)
    assert.equal(isLegacyReviewFormatConversion(plain, `${converted} изменено`), false)
    assert.equal(isLegacyReviewFormatConversion("Текст", "**Текст**"), false)
  })

  it("preserves adjacent links, escaped labels, unknown types and inaccessible IDs through edits", () => {
    const markers = [
      serializeInlineEntity({ type: "title", id: "123", label: "Имя *[текст]* \\ ]" }),
      serializeInlineEntity({ type: "title", id: "99999", label: "Недоступная запись" }),
      serializeInlineEntity({ type: "future", id: "abc", label: "Другой тип" }),
    ].join("")
    const original = `До ${markers} после`
    const document = reviewBodyToDocument(original)
    document.content![0].content!.push({ type: "text", text: " — исправлено" })
    const markdown = reviewDocumentToMarkdown(document)
    const reloaded = reviewBodyToDocument(markdown, "markdown")
    assert.equal(reviewDocumentToMarkdown(reloaded), markdown)
    assert.ok(markdown.includes(markers))
    assert.deepEqual(reviewBodyEntities(markdown, "markdown"), parseInlineMarkup(original).filter((node) => node.type === "entity"))
    const html = renderToStaticMarkup(ReviewBody({ body: markdown, format: "markdown", resolvedEntities: [{ type: "title", id: "123", href: "/media/kept-address" }] }))
    assert.match(html, /href="\/media\/kept-address"/)
    assert.match(html, /Недоступная запись/)
    assert.equal((html.match(/<a /g) ?? []).length, 1)
  })

  it("keeps malformed markers literal on repeated saves", () => {
    const body = "Текст [[broken]] [[title:|нет]] [[title:1|вложено [[title:2|x]]]] [[title:3|незакрыто"
    const markdown = convertLegacy(body)
    assert.equal(reviewBodyToPlainText(markdown, "markdown"), body)
    assert.equal(reviewDocumentToMarkdown(reviewBodyToDocument(markdown, "markdown")), markdown)
    assert.deepEqual(reviewBodyEntities(markdown, "markdown"), [])
  })

  it("round-trips the supported formatting, mentions, quotes, lists and external links", () => {
    const body = "**Жирный** *курсив* ~~зачёркнутый~~ [[title:7|Запись]]\n\n- Один\n- Два\n\n1. Первый\n2. Второй\n\n> Цитата\n\n[ссылка](https://example.com/page?q=1)"
    const saved = reviewDocumentToMarkdown(reviewBodyToDocument(body, "markdown"))
    assert.deepEqual(reviewBodyToDocument(saved, "markdown"), reviewBodyToDocument(body, "markdown"))
    const html = renderToStaticMarkup(ReviewBody({ body: saved, format: "markdown" }))
    for (const tag of ["strong", "em", "s", "ul", "ol", "blockquote"]) assert.ok(html.includes(`<${tag}>`), tag)
    assert.match(html, /href="https:\/\/example.com\/page\?q=1"/)
    assert.equal(reviewBodyToPlainText(body, "markdown"), "Жирный курсив зачёркнутый Запись\nОдин\nДва\nПервый\nВторой\nЦитата\nссылка")
  })

  it("renders hostile HTML and dangerous links without executable elements or URLs", () => {
    const body = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[опасно](javascript:alert) [data](data:text/html,test) [safe](https://example.com)'
    const html = renderToStaticMarkup(ReviewBody({ body, format: "markdown" }))
    assert.doesNotMatch(html, /<script|<img|href="javascript:|href="data:/)
    assert.match(html, /href="https:\/\/example.com"/)
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//example.com", "/media/x", "https://", "https://a.com\n"]) assert.equal(isReviewLinkAllowed(href), false, href)
  })

  it("counts labels and visible text instead of serialized formatting and link URLs", () => {
    const body = `[${"а".repeat(12_000)}](https://example.com/${"x".repeat(100)})`
    assert.equal(parseReviewFormInput({ title: "Рецензия", body, bodyFormat: "markdown" }).ok, true)
    assert.deepEqual(parseReviewFormInput({ title: "Рецензия", body: body + "а", bodyFormat: "markdown" }), { ok: false, error: "body-too-long" })
  })
})
