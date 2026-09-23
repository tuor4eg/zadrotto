import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const read = (file: string) => readFileSync(file, "utf8")

const reviewArticle = read("src/app/review-article.tsx")
const reviewPage = read("src/app/reviews/[id]/page.tsx")
const reviewForm = read("src/app/reviews/review-form.tsx")
const mentionTextarea = read("src/components/inline-mentions/mention-textarea.tsx")
const mentionRenderer = read("src/components/inline-mentions/inline-mention-text.tsx")
const mentionSearchRoute = read("src/app/api/mentions/search/route.ts")
const mentionRegistry = read("src/lib/inline-mentions/registry.ts")
const mediaReviews = read("src/app/media-item-reviews.tsx")
const reviewQueries = read("src/db/queries/contribution-reviews.ts")

describe("inline mentions UI contracts", () => {
  it("resolves mentions on the review page and renders structured nodes without HTML injection", () => {
    assert.match(reviewPage, /parseInlineMarkup/)
    assert.match(reviewPage, /resolveInlineEntities/)
    assert.match(reviewPage, /inlineMarkupToPlainText\(review\.body\)/)
    assert.match(reviewPage, /<ReviewArticle[\s\S]*(?:inlineNodes|nodes)=\{/)

    assert.match(reviewArticle, /<InlineMentionText/)
    assert.doesNotMatch(reviewArticle, />\{review\.body\}<\/p>/)
    assert.doesNotMatch(reviewArticle, /dangerouslySetInnerHTML/)
    assert.doesNotMatch(mentionRenderer, /dangerouslySetInnerHTML/)
    assert.match(mentionRenderer, /<Link[\s\S]*href=\{[^}]*href/)
    assert.match(mentionRenderer, /node\.label/)
  })

  it("uses a controlled mention textarea while preserving the submitted body field", () => {
    assert.match(reviewForm, /import \{ MentionTextarea \}/)
    assert.match(reviewForm, /<MentionTextarea/)
    assert.match(reviewForm, /name="body"/)
    assert.match(reviewForm, /value=\{body\}/)
    assert.match(reviewForm, /onValueChange=\{setBody\}/)
    assert.match(reviewForm, /Чтобы вставить ссылку на запись,[\s\S]*начни печатать её название/)
    assert.doesNotMatch(reviewForm, /<Textarea[\s\S]*name="body"/)
  })

  it("detects the active query at the caret and replaces only its range", () => {
    assert.match(mentionTextarea, /selectionStart/)
    assert.match(mentionTextarea, /selectionEnd/)
    assert.match(mentionTextarea, /serializeInlineEntity/)
    assert.match(mentionTextarea, /value\.slice\(0,\s*activeQuery\.start\)/)
    assert.match(mentionTextarea, /value\.slice\(activeQuery\.end\)/)
    assert.match(mentionTextarea, /setSelectionRange/)
    assert.match(mentionTextarea, /requestAnimationFrame/)
    assert.match(mentionTextarea, /isComposing|composition/i)
  })

  it("provides debounced, abortable and keyboard-accessible suggestions", () => {
    assert.match(mentionTextarea, /triggerConfig\.searchEndpoint/)
    assert.match(mentionRegistry, /searchEndpoint:\s*"\/api\/mentions\/search"/)
    assert.match(mentionTextarea, /AbortController/)
    assert.match(mentionTextarea, /activeQueryKeyRef/)
    assert.match(mentionTextarea, /requestQueryKey/)
    assert.match(mentionTextarea, /SEARCH_DEBOUNCE_MS = 250/)
    assert.match(mentionTextarea, /setTimeout\([\s\S]*SEARCH_DEBOUNCE_MS/)
    assert.match(mentionTextarea, /ArrowDown/)
    assert.match(mentionTextarea, /ArrowUp/)
    assert.match(mentionTextarea, /Enter/)
    assert.match(mentionTextarea, /Tab/)
    assert.match(mentionTextarea, /Escape/)
    assert.match(mentionTextarea, /role="listbox"/)
    assert.match(mentionTextarea, /role="option"/)
    assert.match(mentionTextarea, /aria-activedescendant/)
    assert.match(mentionTextarea, /aria-expanded/)
    assert.match(mentionTextarea, /nextValue\.length > textareaProps\.maxLength/)
    assert.match(mentionTextarea, /className="relative z-40 mt-1 max-h-72/)
    assert.doesNotMatch(mentionTextarea, /className="absolute z-40 mt-1 max-h-72/)
  })

  it("keeps the generic mention search endpoint authenticated and bounded", () => {
    assert.match(mentionSearchRoute, /getCurrentAuthor/)
    assert.match(mentionSearchRoute, /status:\s*401/)
    assert.match(mentionSearchRoute, /searchParams\.get\("trigger"\)/)
    assert.match(mentionSearchRoute, /searchParams\.get\("q"\)/)
    assert.match(mentionSearchRoute, /length < 2/)
    assert.match(mentionSearchRoute, /MentionSuggestion|searchMentionSuggestions/)
    assert.match(mentionSearchRoute, /NextResponse\.json\(\{ items/)
  })

  it("projects markup to labels in metadata, previews, and the main-page excerpt", () => {
    assert.match(reviewPage, /inlineMarkupToPlainText\(review\.body\)/)
    assert.match(mediaReviews, /inlineMarkupToPlainText\(body\)/)
    assert.match(reviewQueries, /inlineMarkupToPlainText\(review\.body\)/)
  })
})
