import { getNotificationTransportRouteState } from "@/db/queries/notification-transport-routes"

import { AdminToasts, type AdminToast } from "../../../admin-toasts"
import { NotificationTransportRoutesForm } from "../notification-transport-routes-form"

type Props = {
  searchParams: Promise<{ saved?: string }>
}

export default async function NotificationRoutingPage({ searchParams }: Props) {
  const [routes, query] = await Promise.all([getNotificationTransportRouteState(), searchParams])
  const toastMessages = [
    ...(query.saved === "1" ? [{ id: "success", tone: "success" as const, text: "Маршрутизация сохранена." }] : []),
  ] satisfies AdminToast[]

  return (
    <section className="space-y-5">
      <AdminToasts clearParams={["saved"]} messages={toastMessages} />
      <div>
        <h2 className="font-serif text-3xl">Маршрутизация</h2>
        <p className="text-sm text-stone-600">
          Какие события дублировать во внешние транспорты. Telegram использует сохранённых получателей транспорта.
        </p>
      </div>
      <NotificationTransportRoutesForm
        telegramEnabledByRoute={{
          bug_report_created: routes.bug_report_created.telegram,
          submission_created: routes.submission_created.telegram,
        }}
      />
    </section>
  )
}
