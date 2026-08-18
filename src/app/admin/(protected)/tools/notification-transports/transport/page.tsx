import { getTelegramTransportAdminState } from "@/db/queries/notification-transports"

import { AdminToasts, type AdminToast } from "../../../admin-toasts"
import { TelegramTransportForm } from "../telegram-transport-form"

type Props = {
  searchParams: Promise<{ saved?: string; error?: string }>
}

function getErrorMessage(error?: string) {
  if (error === "invalid") return "Проверь настройки Telegram."
  if (error === "encryption") return "Не удалось зашифровать токен. Проверь ключ шифрования."
  return null
}

export default async function NotificationTransportPage({ searchParams }: Props) {
  const [state, query] = await Promise.all([getTelegramTransportAdminState(), searchParams])
  const errorMessage = getErrorMessage(query.error)
  const toastMessages = [
    ...(query.saved === "1" ? [{ id: "success", tone: "success" as const, text: "Настройки транспорта сохранены." }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]

  return (
    <section className="space-y-5">
      <AdminToasts clearParams={["saved", "error"]} messages={toastMessages} />
      <div>
        <h2 className="font-serif text-3xl">Транспорт</h2>
        <p className="text-sm text-stone-600">
          Токен бота хранится в зашифрованном виде. На клиент он не отдаётся. Сейчас доступен только Telegram.
        </p>
      </div>
      <TelegramTransportForm state={state} />
    </section>
  )
}
