import { Bell } from "lucide-react"

import { PageHeader } from "../../admin-ui"
import { NotificationToolsNav } from "./notification-tools-nav"

export default function NotificationToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Уведомления"
        description="In-app канал обязательный. Здесь настраиваются дополнительные внешние транспорты."
        aside={<Bell className="size-5 text-stone-500" />}
      />
      <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <NotificationToolsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
