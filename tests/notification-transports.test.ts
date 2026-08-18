import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { sendTelegramMessage, sendTelegramMessages, TelegramTransport } from "@/lib/notifications/transports/telegram-api"
import {
  normalizeTelegramChatIds,
  parseTelegramTransportForm,
} from "@/lib/notifications/transports/telegram"

const schema = readFileSync("src/db/schema.ts", "utf8")
const migration = readFileSync("drizzle/0068_notification_transport_settings.sql", "utf8")
const journal = readFileSync("drizzle/meta/_journal.json", "utf8")
const catalog = readFileSync("src/lib/notifications/transports/catalog.ts", "utf8")
const telegramApi = readFileSync("src/lib/notifications/transports/telegram-api.ts", "utf8")
const crypto = readFileSync("src/lib/notifications/transports/credential-crypto.ts", "utf8")
const query = readFileSync("src/db/queries/notification-transports.ts", "utf8")
const actions = readFileSync("src/app/admin/(protected)/tools/notification-transports/actions.ts", "utf8")
const page = readFileSync("src/app/admin/(protected)/tools/notification-transports/page.tsx", "utf8")
const routingPage = readFileSync("src/app/admin/(protected)/tools/notification-transports/routing/page.tsx", "utf8")
const transportPage = readFileSync("src/app/admin/(protected)/tools/notification-transports/transport/page.tsx", "utf8")
const layout = readFileSync("src/app/admin/(protected)/tools/notification-transports/layout.tsx", "utf8")
const toolsNav = readFileSync("src/app/admin/(protected)/tools/notification-transports/notification-tools-nav.tsx", "utf8")
const form = readFileSync("src/app/admin/(protected)/tools/notification-transports/telegram-transport-form.tsx", "utf8")
const routesForm = readFileSync("src/app/admin/(protected)/tools/notification-transports/notification-transport-routes-form.tsx", "utf8")
const nav = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8")
const activity = readFileSync("src/lib/activity-logs/model.ts", "utf8")
const env = readFileSync(".env.example", "utf8")
const compose = readFileSync("docker-compose.yml", "utf8")
const aiCrypto = readFileSync("src/lib/ai/credential-crypto.ts", "utf8")
const coverCrypto = readFileSync("src/lib/covers/credential-crypto.ts", "utf8")
const emailCrypto = readFileSync("src/lib/auth/email-provider-crypto.ts", "utf8")

describe("Telegram transport settings", () => {
  it("validates chat ids and requires a token only when enabling", () => {
    assert.deepEqual(normalizeTelegramChatIds([" 123 ", "", "123", "-1001"]), ["123", "-1001"])
    assert.equal(normalizeTelegramChatIds(["abc"]), null)
    assert.equal(normalizeTelegramChatIds(["123456789012345678901"]), null)
    assert.equal(normalizeTelegramChatIds("not-an-array-of-ids" as unknown), null)

    assert.deepEqual(
      parseTelegramTransportForm({
        enabled: false,
        botToken: "",
        chatIds: ["", "  "],
        hasStoredBotToken: false,
      }),
      { enabled: false, botToken: null, chatIds: [] },
    )
    assert.equal(
      parseTelegramTransportForm({
        enabled: true,
        botToken: "",
        chatIds: ["123"],
        hasStoredBotToken: false,
      }),
      null,
    )
    assert.equal(
      parseTelegramTransportForm({
        enabled: true,
        botToken: "123:ABC",
        chatIds: [],
        hasStoredBotToken: false,
      }),
      null,
    )
    assert.deepEqual(
      parseTelegramTransportForm({
        enabled: true,
        botToken: "",
        chatIds: ["-100123"],
        hasStoredBotToken: true,
      }),
      { enabled: true, botToken: null, chatIds: ["-100123"] },
    )
    assert.deepEqual(
      parseTelegramTransportForm({
        enabled: true,
        botToken: " 123:NEW ",
        chatIds: ["1", "1"],
        hasStoredBotToken: false,
      }),
      { enabled: true, botToken: "123:NEW", chatIds: ["1"] },
    )
  })

  it("declares a telegram-only settings table in schema and migration", () => {
    for (const source of [schema, migration]) {
      assert.match(source, /notification_transport_settings/)
      assert.match(source, /encrypted_payload/)
      assert.match(source, /key_hint/)
      assert.match(source, /chat_ids/)
      assert.match(source, /telegram/)
    }
    assert.match(schema, /TELEGRAM_TRANSPORT_CODE/)
    assert.match(migration, /CHECK \("code" in \('telegram'\)\)/)
    assert.doesNotMatch(migration, /CREATE INDEX/)
    assert.match(journal, /"idx": 68[\s\S]*"tag": "0068_notification_transport_settings"/)
    assert.match(catalog, /NOTIFICATION_TRANSPORT_CODES = \["telegram"\]/)
    assert.doesNotMatch(catalog, /send|TelegramTransport/)
  })

  it("encrypts the bot token with a dedicated AES-GCM key", () => {
    assert.match(crypto, /NOTIFICATION_TRANSPORT_CREDENTIALS_KEY/)
    assert.match(crypto, /aes-256-gcm/)
    assert.match(crypto, /v1/)
    assert.match(crypto, /setAuthTag/)
    assert.match(crypto, /catch \{\s*return null/)
    assert.doesNotMatch(crypto, /AI_PROVIDER_CREDENTIALS_KEY|COVER_PROVIDER_CREDENTIALS_KEY|EMAIL_PROVIDER_CREDENTIALS_KEY/)
    assert.doesNotMatch(aiCrypto, /NOTIFICATION_TRANSPORT_CREDENTIALS_KEY/)
    assert.doesNotMatch(coverCrypto, /NOTIFICATION_TRANSPORT_CREDENTIALS_KEY/)
    assert.doesNotMatch(emailCrypto, /NOTIFICATION_TRANSPORT_CREDENTIALS_KEY/)
    assert.match(env, /NOTIFICATION_TRANSPORT_CREDENTIALS_KEY=/)
    assert.match(compose, /NOTIFICATION_TRANSPORT_CREDENTIALS_KEY: \$\{NOTIFICATION_TRANSPORT_CREDENTIALS_KEY\}/)
  })

  it("does not expose the decrypted token in the admin form", () => {
    assert.match(form, /type="password"/)
    assert.match(form, /placeholder=\{state\.botTokenHint/)
    assert.doesNotMatch(form, /defaultValue=\{state\.|value=\{state\.botToken/)
    assert.doesNotMatch(transportPage, /botToken[^H]|decryptNotificationTransportCredentials/)
    assert.match(query, /getTelegramTransportAdminState[\s\S]*hasBotToken: Boolean\(row\?\.encryptedPayload\)/)
    assert.doesNotMatch(
      query.slice(
        query.indexOf("export async function getTelegramTransportAdminState"),
        query.indexOf("export async function getTelegramTransportConfig"),
      ),
      /decryptNotificationTransportCredentials/,
    )
  })

  it("saves an encrypted payload and never logs the token", () => {
    assert.match(query, /saveTelegramTransportSettings[\s\S]*encryptNotificationTransportCredentials\(\{ botToken: input\.botToken \}\)/)
    assert.match(query, /db\.transaction\(async \(tx\)[\s\S]*insert\(notificationTransportSettings\)[\s\S]*insert\(adminActivityLogs\)/)
    assert.match(query, /onConflictDoUpdate\(\{[\s\S]*target: notificationTransportSettings\.code/)
    assert.match(actions, /saveTelegramTransportAction[\s\S]*requireAdminUser\(\)/)
    assert.match(actions, /parseTelegramTransportForm/)
    assert.match(actions, /replacedBotToken: Boolean\(parsed\.botToken\)/)
    assert.doesNotMatch(actions, /metadata: \{[^}]*\bbotToken:/)
    assert.match(activity, /"notification-transport"/)
    assert.match(activity, /"notification-transport\.updated"/)
    assert.match(activity, /"notification-transport\.enabled"/)
    assert.match(activity, /"notification-transport\.disabled"/)
    assert.match(activity, /"notification-transport\.tested"/)
    assert.match(nav, /\/admin\/tools\/notification-transports/)
    assert.match(nav, /Уведомления/)
    assert.doesNotMatch(query, /fetch\(|api\.telegram|sendMessage/)
    assert.doesNotMatch(actions, /fetch\(|api\.telegram\.org/)
    assert.match(actions, /testTelegramTransportAction[\s\S]*requireAdminUser\(\)/)
    assert.match(actions, /sendTelegramTestMessages/)
    assert.match(form, /TelegramTransportTestModal/)
    assert.match(form, /onClick=\{startTest\}/)
    assert.doesNotMatch(form, /useEffect/)
    assert.match(form, />\s*Тест\s*</)
    assert.match(telegramApi, /api\.telegram\.org\/bot\$\{input\.botToken\}\/sendMessage/)
    assert.match(telegramApi, /TELEGRAM_API_TIMEOUT_MS = 10_000/)
    assert.match(telegramApi, /setTimeout\(\(\) => controller\.abort\(\), TELEGRAM_API_TIMEOUT_MS\)/)
    assert.match(telegramApi, /export class TelegramTransport/)
    assert.match(telegramApi, /async send\(text: string\)/)
    assert.match(telegramApi, /sendTelegramTestMessages[\s\S]*return sendTelegramMessages/)
    assert.doesNotMatch(telegramApi, /media\.submitted|title_submission/)
    assert.doesNotMatch(telegramApi, /submitted|notification type|заявк/i)
  })

  it("saves notification transport routing without touching telegram credentials", () => {
    assert.match(page, /redirect\("\/admin\/tools\/notification-transports\/routing"\)/)
    assert.match(layout, /title="Уведомления"/)
    assert.match(toolsNav, /Маршрутизация/)
    assert.match(toolsNav, /Транспорт/)
    assert.match(toolsNav, /\/admin\/tools\/notification-transports\/routing/)
    assert.match(toolsNav, /\/admin\/tools\/notification-transports\/transport/)
    assert.match(routingPage, /Маршрутизация сохранена/)
    assert.match(transportPage, /Настройки транспорта сохранены/)
    assert.match(routesForm, /saveNotificationTransportRoutesAction/)
    assert.match(routesForm, /submission_created_telegram|\$\{route\.code\}_telegram/)
    assert.match(routesForm, />\s*Telegram\s*</)
    assert.match(routesForm, /In-app уведомление создаётся всегда/)
    assert.match(actions, /saveNotificationTransportRoutesAction[\s\S]*requireAdminUser\(\)/)
    assert.match(actions, /parseExternalNotificationRouteForm/)
    assert.match(actions, /ROUTING_PATH = "\/admin\/tools\/notification-transports\/routing"/)
    assert.match(actions, /TRANSPORT_PATH = "\/admin\/tools\/notification-transports\/transport"/)
    assert.match(actions, /redirect\(`\$\{ROUTING_PATH\}\?saved=1`\)/)
    assert.match(actions, /submissionCreatedTelegram/)
    assert.doesNotMatch(actions.slice(actions.indexOf("saveNotificationTransportRoutesAction")), /botToken/)
    assert.match(activity, /"notification-transport\.routes\.updated"/)
  })

  it("sends a Telegram test message and keeps the token out of errors", async () => {
    const previousFetch = globalThis.fetch
    const token = "123456:SECRET-TOKEN"
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), `https://api.telegram.org/bot${token}/sendMessage`)
        assert.equal(JSON.parse(String(init?.body)).chat_id, "100")
        return Response.json({ ok: true, result: { message_id: 1 } })
      }
      assert.deepEqual(await sendTelegramMessage({ botToken: token, chatId: "100", text: "ping" }), { ok: true })

      globalThis.fetch = async () => Response.json({
        ok: false,
        error_code: 401,
        description: `Unauthorized bot ${token}`,
      }, { status: 401 })
      const unauthorized = await sendTelegramMessage({ botToken: token, chatId: "100", text: "ping" })
      assert.equal(unauthorized.ok, false)
      if (!unauthorized.ok) {
        assert.equal(unauthorized.httpStatus, 401)
        assert.match(unauthorized.error, /Unauthorized/)
        assert.doesNotMatch(unauthorized.error, /SECRET-TOKEN/)
      }

      globalThis.fetch = async () => {
        throw Object.assign(new Error("AbortError"), { name: "AbortError" })
      }
      assert.deepEqual(
        await sendTelegramMessage({ botToken: token, chatId: "100", text: "ping" }),
        { ok: false, httpStatus: null, error: "Telegram не ответил вовремя." },
      )
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it("sends a prepared text through TelegramTransport without changing credentials", async () => {
    const previousFetch = globalThis.fetch
    const token = "123456:SECRET-TOKEN"
    const chatIds: string[] = []
    try {
      globalThis.fetch = async (_url, init) => {
        chatIds.push(JSON.parse(String(init?.body)).chat_id)
        assert.equal(JSON.parse(String(init?.body)).text, "Новая заявка на запись")
        return Response.json({ ok: true, result: { message_id: 1 } })
      }

      const disabled = new TelegramTransport({ enabled: false, botToken: token, chatIds: ["100"] })
      assert.equal(disabled.isReady(), false)
      assert.deepEqual(await disabled.send("Новая заявка на запись"), [])
      assert.deepEqual(chatIds, [])

      const results = await sendTelegramMessages({
        botToken: token,
        chatIds: ["100", "200"],
        text: "Новая заявка на запись",
      })
      assert.deepEqual(results, [
        { chatId: "100", ok: true, error: null },
        { chatId: "200", ok: true, error: null },
      ])
      assert.deepEqual(chatIds, ["100", "200"])
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
