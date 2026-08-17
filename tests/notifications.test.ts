import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  getNotificationHref,
  getNotificationRecipientType,
  getNotificationTitle,
} from "../src/lib/notifications/catalog"

const schemaSource = readFileSync("src/db/schema.ts", "utf8")
const migrationSource = readFileSync("drizzle/0067_notifications.sql", "utf8")
const catalogSource = readFileSync("src/lib/domain-events/catalog.ts", "utf8")
const registrySource = readFileSync("src/lib/domain-events/registry.ts", "utf8")
const consumerSource = readFileSync("src/lib/notifications/consumer.ts", "utf8")
const mediaSource = readFileSync("src/db/queries/media-items.ts", "utf8")
const franchiseSource = readFileSync("src/db/queries/franchises.ts", "utf8")
const reviewSource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8")
const inboxHostSource = readFileSync("src/components/notifications/notification-inbox.tsx", "utf8")
const authorApiSource = readFileSync("src/app/api/notifications/route.ts", "utf8")
const adminApiSource = readFileSync("src/app/api/admin/notifications/route.ts", "utf8")
const authorReadApiSource = readFileSync("src/app/api/notifications/[id]/read/route.ts", "utf8")
const adminReadApiSource = readFileSync("src/app/api/admin/notifications/[id]/read/route.ts", "utf8")
const notificationQuerySource = readFileSync("src/db/queries/notifications.ts", "utf8")

describe("notifications schema", () => {
  it("stores an inbox row per recipient with unread and list indexes", () => {
    assert.match(schemaSource, /export const notifications = pgTable/)
    assert.match(schemaSource, /recipientType: text\("recipient_type"\)\.notNull\(\)/)
    assert.match(schemaSource, /recipientId: integer\("recipient_id"\)\.notNull\(\)/)
    assert.match(migrationSource, /notifications_recipient_created_at_idx[\s\S]*created_at" DESC/)
    assert.match(migrationSource, /notifications_recipient_unread_idx[\s\S]*read_at" is null/)
    assert.match(migrationSource, /recipient_type" in \('admin', 'author'\)/)
    assert.doesNotMatch(migrationSource, /websocket|web_push|notification_preference/i)
  })
})

describe("notification domain events", () => {
  it("declares submitted and approved facts without replacing published events", () => {
    for (const type of [
      "media.submitted",
      "media.approved",
      "franchise.submitted",
      "franchise.approved",
      "media-franchise.submitted",
      "media-franchise.approved",
      "media-franchise.removal.requested",
      "media-franchise.removal.approved",
      "review.submitted",
      "review.approved",
    ]) {
      assert.match(catalogSource, new RegExp(`"${type.replaceAll(".", "\\.")}"`))
    }
    assert.match(catalogSource, /"media\.published"/)
    assert.match(catalogSource, /"review\.published"/)
    assert.match(catalogSource, /"media-franchise\.published"/)
  })

  it("emits media submission and approval only on the review queue transitions", () => {
    assert.match(
      mediaSource,
      /item\?\.publicationStatus === "submitted"[\s\S]*type: "media\.submitted"/,
    )
    assert.match(
      mediaSource,
      /createdByAuthorId: mediaItems\.createdByAuthorId[\s\S]*type: "media\.published"[\s\S]*type: "media\.approved"/,
    )
    assert.doesNotMatch(
      mediaSource,
      /updateAdminMediaItemPublicationStatus[\s\S]*type: "media\.approved"/,
    )
  })

  it("does not emit franchise events for series bundled into a media submission", () => {
    assert.match(franchiseSource, /export async function moveAuthorFranchisesForMediaSubmission/)
    const moveStart = franchiseSource.indexOf("export async function moveAuthorFranchisesForMediaSubmission")
    const moveEnd = franchiseSource.indexOf("function getSubmittedFranchiseWithoutSubmittedMediaCondition")
    const moveSource = franchiseSource.slice(moveStart, moveEnd)
    assert.doesNotMatch(moveSource, /appendEvent/)
    assert.doesNotMatch(moveSource, /franchise\.submitted/)
  })

  it("emits standalone series, link, and removal request events", () => {
    assert.match(
      franchiseSource,
      /publicationStatus === "submitted"[\s\S]*type: "franchise\.submitted"/,
    )
    assert.match(
      franchiseSource,
      /publicationStatus === "submitted"[\s\S]*type: "media-franchise\.submitted"/,
    )
    assert.match(
      franchiseSource,
      /onConflictDoNothing\(\)\.returning\([\s\S]*type: "media-franchise\.removal\.requested"/,
    )
    assert.match(franchiseSource, /type: "franchise\.approved"/)
    assert.match(franchiseSource, /type: "media-franchise\.approved"/)
    assert.match(franchiseSource, /type: "media-franchise\.removal\.approved"/)
  })

  it("emits review.submitted on the status transition and review.approved only from submitted", () => {
    assert.match(
      reviewSource,
      /input\.status === "submitted" && existing\.status !== "submitted"[\s\S]*type: "review\.submitted"/,
    )
    assert.match(
      reviewSource,
      /input\.status === "submitted"[\s\S]*type: "review\.submitted"/,
    )
    assert.match(
      reviewSource,
      /previous\.status === "submitted"[\s\S]*type: "review\.approved"/,
    )
  })
})

describe("notification consumer", () => {
  it("registers a claim-then-insert consumer for all inbox events", () => {
    assert.match(registrySource, /notificationDomainEventConsumer/)
    assert.match(consumerSource, /key: "notifications\.create"/)
    assert.match(consumerSource, /listAdminUserIds\(tx\)/)
    assert.match(notificationQuerySource, /insertNotifications/)
    assert.match(notificationQuerySource, /eq\(notifications\.recipientType, input\.recipientType\)/)
    assert.match(notificationQuerySource, /isNull\(notifications\.readAt\)/)
  })
})

describe("notification catalog", () => {
  it("maps each type to copy, audience, and href", () => {
    assert.equal(getNotificationTitle("media.submitted"), "Новая заявка на запись")
    assert.equal(getNotificationTitle("review.approved"), "Рецензия одобрена")
    assert.equal(getNotificationRecipientType("media.submitted"), "admin")
    assert.equal(getNotificationRecipientType("media-franchise.removal.requested"), "admin")
    assert.equal(getNotificationRecipientType("franchise.approved"), "author")
    assert.equal(
      getNotificationHref({
        entityId: "12",
        franchiseCode: null,
        mediaItemCode: null,
        type: "media.submitted",
      }),
      "/admin/media/12/edit",
    )
    assert.equal(
      getNotificationHref({
        entityId: "12",
        franchiseCode: null,
        mediaItemCode: "film-matrix",
        type: "media.approved",
      }),
      "/media/film-matrix",
    )
    assert.equal(
      getNotificationHref({
        entityId: "4",
        franchiseCode: null,
        mediaItemCode: null,
        type: "franchise.submitted",
      }),
      "/admin/franchise-review",
    )
    assert.equal(
      getNotificationHref({
        entityId: "4",
        franchiseCode: "series-witcher",
        mediaItemCode: null,
        type: "franchise.approved",
      }),
      "/series/series-witcher",
    )
    assert.equal(
      getNotificationHref({
        entityId: "9",
        franchiseCode: null,
        mediaItemCode: null,
        type: "review.submitted",
      }),
      "/admin/reviews/9",
    )
    assert.equal(
      getNotificationHref({
        entityId: "9",
        franchiseCode: null,
        mediaItemCode: "film-matrix",
        type: "review.approved",
      }),
      "/media/film-matrix",
    )
  })
})

describe("notification polling", () => {
  it("polls the matching session API and skips hidden tabs and guests", () => {
    assert.match(inboxHostSource, /const POLL_INTERVAL_MS = 30_000/)
    assert.match(inboxHostSource, /document\.visibilityState !== "visible"/)
    assert.match(inboxHostSource, /if \(authenticatedRef\.current\)/)
    assert.match(inboxHostSource, /isAdminRoute \? "\/api\/admin\/notifications" : "\/api\/notifications"/)
    assert.match(authorApiSource, /getCurrentAuthor\(\)/)
    assert.match(adminApiSource, /getCurrentAdminUser\(\)/)
    assert.match(authorReadApiSource, /recipientType: "author"/)
    assert.match(adminReadApiSource, /recipientType: "admin"/)
    assert.match(authorReadApiSource, /markRecipientNotificationRead/)
    assert.match(adminReadApiSource, /markRecipientNotificationRead/)
  })
})
