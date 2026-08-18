import type { TelegramTransportConfig } from "@/lib/notifications/transports/telegram"

const TELEGRAM_API_TIMEOUT_MS = 10_000
const TELEGRAM_TEST_MESSAGE = "Тестовое сообщение из админки zadrotto."

export type TelegramSendResult =
  | { ok: true }
  | { ok: false; error: string; httpStatus: number | null }

export type TelegramTestRecipientResult = {
  chatId: string
  ok: boolean
  error: string | null
}

function sanitizeTelegramError(text: string, botToken: string) {
  return text.replaceAll(botToken, "[redacted]").trim().slice(0, 200)
}

function readTelegramDescription(body: unknown) {
  if (!body || typeof body !== "object" || !("description" in body)) return ""
  return typeof body.description === "string" ? body.description.trim() : ""
}

export async function sendTelegramMessage(input: {
  botToken: string
  chatId: string
  text: string
}): Promise<TelegramSendResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS)

  try {
    const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "zadrotto-notification-transport/1.0",
      },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
      }),
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body && typeof body === "object" && "ok" in body && body.ok === true) {
      return { ok: true }
    }

    const description = readTelegramDescription(body)
    return {
      ok: false,
      httpStatus: response.status,
      error: sanitizeTelegramError(description || `Telegram HTTP ${response.status}`, input.botToken),
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Telegram не ответил вовремя."
      : error instanceof Error
        ? error.message
        : "Запрос к Telegram не выполнен."
    return {
      ok: false,
      httpStatus: null,
      error: sanitizeTelegramError(message, input.botToken),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendTelegramMessages(input: {
  botToken: string
  chatIds: string[]
  text: string
}): Promise<TelegramTestRecipientResult[]> {
  const results: TelegramTestRecipientResult[] = []

  for (const chatId of input.chatIds) {
    const result = await sendTelegramMessage({
      botToken: input.botToken,
      chatId,
      text: input.text,
    })
    results.push(result.ok
      ? { chatId, ok: true, error: null }
      : { chatId, ok: false, error: result.error })
  }

  return results
}

export async function sendTelegramTestMessages(input: {
  botToken: string
  chatIds: string[]
}) {
  return sendTelegramMessages({
    ...input,
    text: TELEGRAM_TEST_MESSAGE,
  })
}

export class TelegramTransport {
  constructor(private readonly config: TelegramTransportConfig) {}

  isReady() {
    return Boolean(this.config.enabled && this.config.botToken && this.config.chatIds.length > 0)
  }

  async send(text: string) {
    if (!this.isReady() || !this.config.botToken) return []

    return sendTelegramMessages({
      botToken: this.config.botToken,
      chatIds: this.config.chatIds,
      text,
    })
  }
}
