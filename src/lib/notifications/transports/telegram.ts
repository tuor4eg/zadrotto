export const TELEGRAM_CHAT_ID_PATTERN = /^-?\d{1,20}$/

export type TelegramTransportAdminState = {
  enabled: boolean
  hasBotToken: boolean
  botTokenHint: string | null
  chatIds: string[]
}

export type TelegramTransportConfig = {
  enabled: boolean
  botToken: string | null
  chatIds: string[]
}

export type ParsedTelegramTransportSettings = {
  enabled: boolean
  botToken: string | null
  chatIds: string[]
}

export function normalizeTelegramChatIds(values: unknown) {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : null
  if (!raw) return null

  const chatIds: string[] = []
  const seen = new Set<string>()

  for (const value of raw) {
    if (typeof value !== "string") return null
    const chatId = value.trim()
    if (!chatId) continue
    if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) return null
    if (seen.has(chatId)) continue
    seen.add(chatId)
    chatIds.push(chatId)
  }

  return chatIds
}

export function parseTelegramTransportForm(input: {
  enabled: boolean
  botToken: string
  chatIds: unknown
  hasStoredBotToken: boolean
}): ParsedTelegramTransportSettings | null {
  const chatIds = normalizeTelegramChatIds(input.chatIds)
  if (!chatIds) return null

  const botToken = input.botToken.trim()
  const keepExistingToken = botToken.length === 0
  if (keepExistingToken && input.enabled && !input.hasStoredBotToken) return null
  if (input.enabled && chatIds.length === 0) return null

  return {
    enabled: input.enabled,
    botToken: keepExistingToken ? null : botToken,
    chatIds,
  }
}
