import { getTelegramTransportAdminState } from "@/db/queries/notification-transports"

import { AdminToasts, type AdminToast } from "../../admin-toasts"
import { PageHeader } from "../../admin-ui"
import { TelegramTransportForm } from "./telegram-transport-form"

type Props = {
  searchParams: Promise<{ saved?: string; error?: string }>
}

function getErrorMessage(error?: string) {
  if (error === "invalid") return "Проверь настройки Telegram."
  if (error === "encryption") return "Не удалось зашифровать токен. Проверь ключ шифрования."
  return null
}

export default async function NotificationTransportsPage({ searchParams }: Props) {
  const [state, query] = await Promise.all([getTelegramTransportAdminState(), searchParams])
  const errorMessage = getErrorMessage(query.error)
  const toastMessages = [
    ...(query.saved === "1" ? [{ id: "success", tone: "success" as const, text: "Настройки транспорта сохранены." }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["saved", "error"]} messages={toastMessages} />
      <PageHeader
        title="Транспорт"
        description="Куда отправлять служебные уведомления. Сейчас доступен только Telegram."
      />
      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold">Telegram</h3>
          <p className="mt-1 text-sm text-stone-500">
            Токен бота хранится в зашифрованном виде. На клиент он не отдаётся.
          </p>
        </div>
        <TelegramTransportForm state={state} />
      </section>
    </div>
  )
}
