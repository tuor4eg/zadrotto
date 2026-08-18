import { Button } from "@/components/ui/button"
import { EXTERNAL_NOTIFICATION_ROUTES } from "@/lib/notifications/routes"

import { saveNotificationTransportRoutesAction } from "./actions"

export function NotificationTransportRoutesForm({
  telegramEnabled,
}: {
  telegramEnabled: boolean
}) {
  return (
    <form action={saveNotificationTransportRoutesAction} className="grid gap-4 rounded-md border bg-white p-5">
      {EXTERNAL_NOTIFICATION_ROUTES.map((route) => (
        <div key={route.code} className="grid gap-2">
          <div>
            <div className="text-sm font-medium text-stone-900">{route.label}</div>
            <p className="text-xs text-stone-500">{route.description}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              name={`${route.code}_telegram`}
              value="1"
              defaultChecked={telegramEnabled}
            />
            Telegram
          </label>
        </div>
      ))}
      <p className="text-xs text-stone-500">
        In-app уведомление создаётся всегда. Telegram использует сохранённых получателей транспорта.
      </p>
      <Button type="submit">Сохранить маршрутизацию</Button>
    </form>
  )
}
