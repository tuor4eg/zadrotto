import type { JSONContent } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"
import Mention from "@tiptap/extension-mention"
import StarterKit from "@tiptap/starter-kit"
import type { Transaction } from "@tiptap/pm/state"

import { inlineMarkupToPlainText, parseInlineMarkup, parseInlineEntityAtStart, serializeInlineEntity } from "@/lib/inline-mentions/markup"

import type { ReviewBodyFormat } from "./constants"
export { REVIEW_BODY_MAX_BYTES, type ReviewBodyFormat } from "./constants"

export function isReviewLinkAllowed(href: string) {
  if (!/^https?:\/\//i.test(href) || /[\u0000-\u0020\u007f]/u.test(href)) return false
  try {
    const url = new URL(href)
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname)
  } catch {
    return false
  }
}

// Only the legacy marker syntax is custom; Markdown itself is handled by Tiptap.
export const ReviewMention = Mention.extend({
  selectable: true,
  addAttributes() {
    return { ...this.parent?.(), entityType: { default: "title" } }
  },
  markdownTokenName: "reviewMention",
  markdownTokenizer: {
    name: "reviewMention",
    level: "inline",
    start: (source) => source.indexOf("[["),
    tokenize(source) {
      const marker = parseInlineEntityAtStart(source)
      if (!marker) return
      const { node, end } = marker
      return { type: "reviewMention", raw: source.slice(0, end), entityType: node.entityType, id: node.id, label: node.label }
    },
  },
  parseMarkdown: (token) => ({ type: "mention", attrs: { entityType: token.entityType, id: token.id, label: token.label } }),
  renderMarkdown: (node) => serializeInlineEntity({ type: node.attrs?.entityType ?? "title", id: node.attrs?.id, label: node.attrs?.label }),
}).configure({
  renderText: ({ node }) => node.attrs.label ?? "",
  renderHTML: ({ node }) => ["span", { "data-type": "mention", title: "Изменить текст ссылки", class: "cursor-pointer font-medium text-red-950 underline decoration-red-950/35 underline-offset-4" }, node.attrs.label ?? ""],
})

export function updateReviewMentionLabel(transaction: Transaction, position: number, label: string) {
  const node = transaction.doc.nodeAt(position)
  if (node?.type.name !== "mention" || !label.trim()) return false
  transaction.setNodeMarkup(position, undefined, { ...node.attrs, label: label.trim() })
  return true
}

export const reviewStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => extension.name !== "paragraph" ? extension : extension.extend({
      renderMarkdown(node, helpers, context) {
        const rendered = this.parent?.(node, helpers, context) ?? helpers.renderChildren(node.content ?? [])
        // Tiptap escapes inline punctuation but leaves literal block prefixes intact.
        // Protect paragraph text from turning into headings, lists, rules or code on reload.
        return rendered
          .replace(/^[ \t]+/gm, (spaces: string) => [...spaces].map((space) => space === "\t" ? "&#9;" : "&#32;").join(""))
          .replace(/^([#>+=-])/gm, "\\$1")
          .replace(/^(\d+)([.)])/gm, "$1\\$2")
      },
    }))
  },
}).configure({
  heading: false, code: false, codeBlock: false, horizontalRule: false, underline: false,
  link: { openOnClick: false, autolink: false, isAllowedUri: isReviewLinkAllowed },
})

export const reviewExtensions = [reviewStarterKit, ReviewMention]
const markdown = new MarkdownManager({ extensions: reviewExtensions, markedOptions: { gfm: true, breaks: true } })

/** Keep the same supported schema for rendering, validation and editing, including hostile input. */
function supportedDocument(node: JSONContent): JSONContent[] {
  if (node.type === "text") {
    if (!node.text) return []
    return [{ type: "text", text: node.text, marks: node.marks?.filter((mark) =>
      ["bold", "italic", "strike"].includes(mark.type) || (mark.type === "link" && isReviewLinkAllowed(mark.attrs?.href ?? "")),
    ) }]
  }
  if (node.type === "mention") return [node]
  const content = node.content?.flatMap(supportedDocument)
  if (["doc", "paragraph", "hardBreak", "bulletList", "orderedList", "listItem", "blockquote"].includes(node.type ?? "")) {
    return [{ ...node, content }]
  }
  return [{ type: "paragraph", content: content ?? (node.text ? [{ type: "text", text: node.text }] : []) }]
}

export function reviewBodyToDocument(body: string, format: ReviewBodyFormat = "plain"): JSONContent {
  if (format === "markdown") return supportedDocument(markdown.parse(body))[0] ?? { type: "doc", content: [] }
  // A paragraph per source line preserves blank lines and literal Markdown/HTML on first edit.
  const paragraphs: JSONContent[] = [{ type: "paragraph", content: [] }]
  for (const node of parseInlineMarkup(body)) {
    if (node.type === "entity") {
      paragraphs.at(-1)!.content!.push({ type: "mention", attrs: { entityType: node.entityType, id: node.id, label: node.label } })
    } else {
      node.value.split("\n").forEach((line, index) => {
        if (index) paragraphs.push({ type: "paragraph", content: [] })
        if (line) paragraphs.at(-1)!.content!.push({ type: "text", text: line })
      })
    }
  }
  return { type: "doc", content: paragraphs }
}

export function reviewDocumentToMarkdown(document: JSONContent) {
  return markdown.serialize(document)
}

export function isLegacyReviewFormatConversion(oldBody: string, newBody: string) {
  return JSON.stringify(reviewBodyToDocument(oldBody, "plain")) === JSON.stringify(reviewBodyToDocument(newBody, "markdown"))
}

function documentText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? ""
  if (node.type === "mention") return node.attrs?.label ?? ""
  if (node.type === "hardBreak") return "\n"
  return (node.content ?? []).map(documentText).join(["doc", "bulletList", "orderedList", "listItem", "blockquote"].includes(node.type ?? "") ? "\n" : "")
}

export function reviewBodyToPlainText(body: string, format: ReviewBodyFormat = "plain") {
  return format === "plain" ? inlineMarkupToPlainText(body) : documentText(reviewBodyToDocument(body, format))
}

export function reviewBodyEntities(body: string, format: ReviewBodyFormat = "plain") {
  if (format === "plain") return parseInlineMarkup(body)
  const nodes: ReturnType<typeof parseInlineMarkup> = []
  function visit(node: JSONContent) {
    if (node.type === "mention") nodes.push({ type: "entity", entityType: node.attrs?.entityType ?? "title", id: node.attrs?.id, label: node.attrs?.label })
    node.content?.forEach(visit)
  }
  visit(reviewBodyToDocument(body, format))
  return nodes
}
