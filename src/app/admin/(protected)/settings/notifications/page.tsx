import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getToastSettings,
  MAX_TOAST_DURATION_SECONDS,
  MIN_TOAST_DURATION_SECONDS,
} from "@/db/queries/toast-settings";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { SettingsSectionHeader } from "../settings-section-header";
import { updateToastSettingsAction } from "./actions";

type PageProps = { searchParams: Promise<{ error?: string; updated?: string }> };

export default async function AdminNotificationSettingsPage({ searchParams }: PageProps) {
  const [settings, params] = await Promise.all([getToastSettings(), searchParams]);
  const messages = [
    ...(params.updated === "1" ? [{ id: "updated", tone: "success" as const, text: "Настройки уведомлений сохранены." }] : []),
    ...(params.error ? [{ id: "error", tone: "error" as const, text: `Укажи целое число от ${MIN_TOAST_DURATION_SECONDS} до ${MAX_TOAST_DURATION_SECONDS} секунд.` }] : []),
  ] satisfies AdminToast[];

  return (
    <section>
      <AdminToasts clearParams={["error", "updated"]} messages={messages} />
      <SettingsSectionHeader
        icon={<Bell />}
        title="Уведомления"
        description="Время показа всплывающих сообщений на сайте и в панели управления."
      />

      <div className="mt-5 max-w-2xl">
        <form action={updateToastSettingsAction} className="space-y-5 rounded-lg border border-stone-200 bg-white p-5">
          <DurationField
            defaultValue={settings.siteDurationSeconds}
            description="Для архива и кабинета автора."
            id="siteDurationSeconds"
            label="Тост на сайте, секунд"
          />
          <DurationField
            defaultValue={settings.adminDurationSeconds}
            description="Для всех страниц панели управления."
            id="adminDurationSeconds"
            label="Тост в админке, секунд"
          />
          <Button type="submit">Сохранить</Button>
        </form>
      </div>
    </section>
  );
}

function DurationField({ defaultValue, description, id, label }: {
  defaultValue: number;
  description: string;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>
      <input
        className="h-10 w-full max-w-48 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950"
        defaultValue={defaultValue}
        id={id}
        inputMode="numeric"
        max={MAX_TOAST_DURATION_SECONDS}
        min={MIN_TOAST_DURATION_SECONDS}
        name={id}
        required
        step={1}
        type="number"
      />
      <p className="text-sm text-stone-500">{description}</p>
    </div>
  );
}
