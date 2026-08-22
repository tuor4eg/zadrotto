"use server"

import { redirect } from "next/navigation"

import type { CreateActivityLogInput } from "@/db/queries/activity-logs"
import {
  getTelegramTransportAdminState,
  getTelegramTransportConfig,
  saveTelegramTransportSettings,
} from "@/db/queries/notification-transports"
import { saveNotificationTransportRoutes } from "@/db/queries/notification-transport-routes"
import { logActivity, prepareActivityLog } from "@/lib/activity-logs/server"
import { requireAdminUser } from "@/lib/auth/admin-auth"
import { TELEGRAM_TRANSPORT_CODE } from "@/lib/notifications/transports/catalog"
import { sendTelegramTestMessages } from "@/lib/notifications/transports/telegram-api"
import { parseTelegramTransportForm } from "@/lib/notifications/transports/telegram"
import { parseExternalNotificationRouteForm } from "@/lib/notifications/routes"

export type TelegramTransportTestState = {
  ok: boolean
  error: "missing-token" | "decrypt-error" | "missing-recipients" | "send-failed" | null
  results: { chatId: string; ok: boolean; error: string | null }[]
}

const TRANSPORT_PATH = "/admin/tools/notification-transports/transport"
const ROUTING_PATH = "/admin/tools/notification-transports/routing"

function read(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

export async function saveTelegramTransportAction(formData: FormData) {
  const admin = await requireAdminUser()
  const current = await getTelegramTransportAdminState()
  const parsed = parseTelegramTransportForm({
    enabled: formData.get("enabled") === "1",
    botToken: read(formData, "botToken"),
    chatIds: formData.getAll("chatIds"),
    hasStoredBotToken: current.hasBotToken,
  })

  if (!parsed) {
    await logActivity({
      action: "notification-transport.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "notification-transport",
      entityLabel: "Telegram",
      status: "failure",
      message: "Настройки Telegram-транспорта не прошли проверку.",
      metadata: { code: TELEGRAM_TRANSPORT_CODE, reason: "invalid-config" },
    })
    redirect(`${TRANSPORT_PATH}?error=invalid`)
  }

  const activityLogs: [CreateActivityLogInput, ...CreateActivityLogInput[]] = [
    await prepareActivityLog({
      action: "notification-transport.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "notification-transport",
      entityLabel: "Telegram",
      message: "Настройки Telegram-транспорта сохранены.",
      metadata: {
        code: TELEGRAM_TRANSPORT_CODE,
        enabled: parsed.enabled,
        replacedBotToken: Boolean(parsed.botToken),
        chatIdCount: parsed.chatIds.length,
      },
    }),
  ]

  if (current.enabled !== parsed.enabled) {
    activityLogs.push(
      await prepareActivityLog({
        action: parsed.enabled ? "notification-transport.enabled" : "notification-transport.disabled",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "notification-transport",
        entityLabel: "Telegram",
        message: parsed.enabled ? "Telegram-транспорт включён." : "Telegram-транспорт выключен.",
        metadata: { code: TELEGRAM_TRANSPORT_CODE },
      }),
    )
  }

  const saved = await saveTelegramTransportSettings({
    adminId: admin.id,
    enabled: parsed.enabled,
    botToken: parsed.botToken,
    chatIds: parsed.chatIds,
    activityLogs,
  })

  if (!saved) {
    await logActivity({
      action: "notification-transport.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "notification-transport",
      entityLabel: "Telegram",
      status: "failure",
      message: "Не удалось сохранить настройки Telegram-транспорта.",
      metadata: { code: TELEGRAM_TRANSPORT_CODE, reason: "encryption" },
    })
  }

  redirect(saved ? `${TRANSPORT_PATH}?saved=1` : `${TRANSPORT_PATH}?error=encryption`)
}

export async function testTelegramTransportAction(): Promise<TelegramTransportTestState> {
  const admin = await requireAdminUser()
  const [config, current] = await Promise.all([
    getTelegramTransportConfig(),
    getTelegramTransportAdminState(),
  ])

  if (!config.botToken) {
    const error = current.hasBotToken ? "decrypt-error" : "missing-token"
    await logActivity({
      action: "notification-transport.tested",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "notification-transport",
      entityLabel: "Telegram",
      status: "failure",
      message: "Тест Telegram-транспорта недоступен: нет рабочего token.",
      metadata: { code: TELEGRAM_TRANSPORT_CODE, reason: error },
    })
    return { ok: false, error, results: [] }
  }

  if (config.chatIds.length === 0) {
    await logActivity({
      action: "notification-transport.tested",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "notification-transport",
      entityLabel: "Telegram",
      status: "failure",
      message: "Тест Telegram-транспорта недоступен: нет получателей.",
      metadata: { code: TELEGRAM_TRANSPORT_CODE, reason: "missing-recipients" },
    })
    return { ok: false, error: "missing-recipients", results: [] }
  }

  const results = await sendTelegramTestMessages({
    botToken: config.botToken,
    chatIds: config.chatIds,
  })
  const ok = results.every((item) => item.ok)

  await logActivity({
    action: "notification-transport.tested",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "notification-transport",
    entityLabel: "Telegram",
    status: ok ? "success" : "failure",
    message: ok
      ? "Тестовое сообщение Telegram отправлено."
      : "Тест Telegram-транспорта завершился ошибкой.",
    metadata: {
      code: TELEGRAM_TRANSPORT_CODE,
      recipientCount: results.length,
      successCount: results.filter((item) => item.ok).length,
      failedCount: results.filter((item) => !item.ok).length,
    },
  })

  return { ok, error: ok ? null : "send-failed", results }
}

export async function saveNotificationTransportRoutesAction(formData: FormData) {
  const admin = await requireAdminUser()
  const routes = parseExternalNotificationRouteForm(formData)
  await saveNotificationTransportRoutes({
    adminId: admin.id,
    routes,
    activityLog: await prepareActivityLog({
      action: "notification-transport.routes.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "notification-transport",
      entityLabel: "Маршрутизация",
      message: "Маршрутизация внешних уведомлений сохранена.",
      metadata: {
        submissionCreatedTelegram: routes.submission_created.includes(TELEGRAM_TRANSPORT_CODE),
        bugReportCreatedTelegram: routes.bug_report_created.includes(TELEGRAM_TRANSPORT_CODE),
      },
    }),
  })
  redirect(`${ROUTING_PATH}?saved=1`)
}
