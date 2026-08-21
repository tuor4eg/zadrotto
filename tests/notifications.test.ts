import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  getAdminSubmissionStatusLabel,
  getNotificationHref,
  getNotificationRecipientType,
  getNotificationTitle,
  isAdminSubmissionNotificationType,
} from "../src/lib/notifications/catalog"
import {
  formatExternalNotificationText,
  getExternalNotificationRoute,
  parseExternalNotificationRouteForm,
  SUBMISSION_CREATED_NOTIFICATION_TYPES,
} from "../src/lib/notifications/routes"

const schemaSource = readFileSync("src/db/schema.ts", "utf8")
const migrationSource = readFileSync("drizzle/0067_notifications.sql", "utf8")
const catalogSource = readFileSync("src/lib/domain-events/catalog.ts", "utf8")
const registrySource = readFileSync("src/lib/domain-events/registry.ts", "utf8")
const consumerSource = readFileSync("src/lib/notifications/consumer.ts", "utf8")
const externalSource = readFileSync("src/lib/notifications/external.ts", "utf8")
const routesSource = readFileSync("src/lib/notifications/routes.ts", "utf8")
const routesQuerySource = readFileSync("src/db/queries/notification-transport-routes.ts", "utf8")
const routesMigrationSource = readFileSync("drizzle/0069_notification_transport_routes.sql", "utf8")
const telegramApiSource = readFileSync("src/lib/notifications/transports/telegram-api.ts", "utf8")
const mediaSource = readFileSync("src/db/queries/media-items.ts", "utf8")
const franchiseSource = readFileSync("src/db/queries/franchises.ts", "utf8")
const reviewSource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8")
const inboxHostSource = readFileSync("src/components/notifications/notification-inbox.tsx", "utf8")
const inboxSource = readFileSync("src/lib/notifications/inbox.ts", "utf8")
const authorApiSource = readFileSync("src/app/api/notifications/route.ts", "utf8")
const authorDeleteApiSource = readFileSync("src/app/api/notifications/[id]/route.ts", "utf8")
const adminApiSource = readFileSync("src/app/api/admin/notifications/route.ts", "utf8")
const adminDeleteApiSource = readFileSync("src/app/api/admin/notifications/[id]/route.ts", "utf8")
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
    assert.match(schemaSource, /export const notificationTransportRoutes = pgTable/)
    assert.match(routesMigrationSource, /notification_transport_routes/)
    assert.match(routesMigrationSource, /CHECK \("code" in \('submission_created'\)\)/)
    assert.doesNotMatch(routesMigrationSource, /CREATE INDEX/)
    assert.match(schemaSource, /EXTERNAL_NOTIFICATION_ROUTE_CODES/)
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

  it("fans out to external transports after in-app insert commits", () => {
    assert.match(consumerSource, /afterCommit[\s\S]*dispatchExternalNotificationTransports/)
    assert.doesNotMatch(consumerSource, /fetch\(|TelegramTransport|api\.telegram/)
    const dispatcher = readFileSync("src/lib/domain-events/dispatcher.ts", "utf8")
    const handleIndex = dispatcher.indexOf("await consumer.handle(tx, typedEvent)")
    const afterCommitIndex = dispatcher.indexOf("await consumer.afterCommit(typedEvent)")
    assert.ok(handleIndex !== -1 && afterCommitIndex > handleIndex)
    assert.match(dispatcher, /try \{\s*await consumer.afterCommit\(typedEvent\)/)
    assert.match(dispatcher, /Failed to run domain event consumer afterCommit/)
    assert.match(externalSource, /getEnabledExternalTransportCodes\(event\.type\)/)
    assert.match(externalSource, /new TelegramTransport/)
    assert.match(externalSource, /if \(!transport\.isReady\(\)\) return/)
    assert.doesNotMatch(externalSource, /Telegram transport is not ready/)
    assert.match(externalSource, /console\.error\("Failed to send Telegram notification"/)
    assert.doesNotMatch(externalSource, /throw /)
    assert.doesNotMatch(externalSource, /export function formatExternalNotificationText/)
    assert.match(telegramApiSource, /export class TelegramTransport/)
    assert.doesNotMatch(telegramApiSource, /submitted|notification type|заявк/i)
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
    assert.deepEqual(
      [...SUBMISSION_CREATED_NOTIFICATION_TYPES].sort(),
      [
        "franchise.submitted",
        "media-franchise.removal.requested",
        "media-franchise.submitted",
        "media.submitted",
        "review.submitted",
      ],
    )
    assert.equal(getExternalNotificationRoute("media.submitted")?.code, "submission_created")
    assert.equal(getExternalNotificationRoute("franchise.submitted")?.code, "submission_created")
    assert.equal(getExternalNotificationRoute("media-franchise.submitted")?.code, "submission_created")
    assert.equal(getExternalNotificationRoute("media-franchise.removal.requested")?.code, "submission_created")
    assert.equal(getExternalNotificationRoute("review.submitted")?.code, "submission_created")
    assert.equal(getExternalNotificationRoute("media.approved"), null)
    assert.equal(getExternalNotificationRoute("review.approved"), null)
    assert.equal(
      formatExternalNotificationText({
        title: "Новая заявка на запись",
        body: "Матрица",
        href: "/admin/media/12/edit",
        siteOrigin: "https://zadrotto.example",
      }),
      "Новая заявка на запись\nМатрица\nhttps://zadrotto.example/admin/media/12/edit",
    )
    assert.equal(
      formatExternalNotificationText({
        title: "Новая заявка на запись",
        body: "Матрица",
        href: "/admin/media/12/edit",
        siteOrigin: null,
      }),
      "Новая заявка на запись\nМатрица\n/admin/media/12/edit",
    )
    assert.equal(
      formatExternalNotificationText({
        title: "Новая заявка на запись",
        body: "Матрица",
        href: null,
        siteOrigin: "https://zadrotto.example",
      }),
      "Новая заявка на запись\nМатрица",
    )
    const enabled = new FormData()
    enabled.set("submission_created_telegram", "1")
    assert.deepEqual(parseExternalNotificationRouteForm(enabled), { submission_created: ["telegram"] })
    assert.deepEqual(parseExternalNotificationRouteForm(new FormData()), { submission_created: [] })
    assert.match(routesSource, /label: "Новая заявка"/)
    assert.match(routesSource, /связь с серией/)
    assert.doesNotMatch(routesSource, /тайтл/i)
    assert.doesNotMatch(routesSource, /getNotificationRecipientType/)
    assert.match(routesQuerySource, /saveNotificationTransportRoutes[\s\S]*insert\(notificationTransportRoutes\)[\s\S]*insert\(adminActivityLogs\)/)
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

describe("admin submission inbox status", () => {
  it("maps the current entity status to a Russian caption", () => {
    assert.equal(getAdminSubmissionStatusLabel("submitted"), null)
    assert.equal(getAdminSubmissionStatusLabel("published"), "Уже опубликована")
    assert.equal(getAdminSubmissionStatusLabel("rejected"), "Уже отклонена")
    assert.equal(getAdminSubmissionStatusLabel("private"), "Снята с модерации")
    assert.equal(getAdminSubmissionStatusLabel("draft"), "Снята с модерации")
    assert.equal(getAdminSubmissionStatusLabel("hidden"), "Снята с модерации")
    assert.equal(getAdminSubmissionStatusLabel(null), "Уже обработана")
    assert.equal(isAdminSubmissionNotificationType("media.submitted"), true)
    assert.equal(isAdminSubmissionNotificationType("review.submitted"), true)
    assert.equal(isAdminSubmissionNotificationType("media.approved"), false)
    assert.equal(isAdminSubmissionNotificationType("review.approved"), false)
  })

  it("does not count resolved admin submissions as unread", () => {
    assert.match(notificationQuerySource, /export const adminSubmissionStillOpenSql/)
    assert.match(
      notificationQuerySource,
      /recipientType === "admin" \? \[adminSubmissionStillOpenSql\] : \[\]/,
    )
    assert.match(notificationQuerySource, /when 'media.submitted' then exists/)
    assert.match(notificationQuerySource, /when 'franchise.submitted' then exists/)
    assert.match(notificationQuerySource, /when 'media-franchise.submitted' then exists/)
    assert.match(notificationQuerySource, /when 'media-franchise.removal.requested' then exists/)
    assert.match(notificationQuerySource, /when 'review.submitted' then exists/)
    assert.match(notificationQuerySource, /mediaItems.publicationStatus\} = 'submitted'/)
    assert.match(notificationQuerySource, /mediaItemFranchiseRemovalRequests/)
    assert.doesNotMatch(
      notificationQuerySource,
      /recipientType === "author" \? \[adminSubmissionStillOpenSql\]/,
    )
  })

  it("renders the current moderation outcome in the inbox", () => {
    assert.match(inboxSource, /statusLabel: item.statusLabel/)
    assert.match(inboxHostSource, /item.statusLabel/)
    assert.match(inboxHostSource, /isMuted = Boolean\(item.readAt \|\| item.statusLabel\)/)
    assert.match(inboxHostSource, /item.statusLabel \? \(/)
    assert.equal(
      getNotificationHref({
        entityId: "12",
        franchiseCode: null,
        mediaItemCode: "film-matrix",
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
  })
})

describe("notification deletion", () => {
  it("deletes one or all inbox rows for the current recipient only", () => {
    assert.match(notificationQuerySource, /export async function deleteNotification/)
    assert.match(notificationQuerySource, /export async function deleteAllRecipientNotifications/)
    assert.match(
      notificationQuerySource,
      /eq\(notifications\.id, input\.notificationId\),[\s\S]*eq\(notifications\.recipientType, input\.recipientType\),[\s\S]*eq\(notifications\.recipientId, input\.recipientId\)/,
    )
    assert.match(
      notificationQuerySource,
      /deleteAllRecipientNotifications[\s\S]*eq\(notifications\.recipientType, input\.recipientType\),[\s\S]*eq\(notifications\.recipientId, input\.recipientId\)/,
    )
    assert.doesNotMatch(notificationQuerySource, /delete\(notifications\)[\s\S]*\.where\(\s*undefined/)
    assert.match(adminApiSource, /export async function DELETE/)
    assert.match(adminApiSource, /deleteAllInboxNotifications/)
    assert.match(adminApiSource, /recipientType: "admin"/)
    assert.match(adminDeleteApiSource, /export async function DELETE/)
    assert.match(adminDeleteApiSource, /deleteRecipientNotification/)
    assert.match(adminDeleteApiSource, /recipientType: "admin"/)
    assert.match(authorApiSource, /export async function DELETE/)
    assert.match(authorApiSource, /deleteAllInboxNotifications/)
    assert.match(authorApiSource, /recipientType: "author"/)
    assert.match(authorDeleteApiSource, /export async function DELETE/)
    assert.match(authorDeleteApiSource, /deleteRecipientNotification/)
    assert.match(authorDeleteApiSource, /recipientType: "author"/)
  })

  it("lets admins and authors remove notifications from a bounded scrollable inbox", () => {
    assert.match(inboxHostSource, /method: "DELETE"/)
    assert.match(inboxHostSource, /Удалить все/)
    assert.match(inboxHostSource, /Точно удалить все\?/)
    assert.match(inboxHostSource, /inbox\.deleteOne\(item\.id\)/)
    assert.match(inboxHostSource, /max-h-\[min\(28rem,calc\(100vh-8rem\)\)\] overflow-y-auto overscroll-contain/)
  })
})

