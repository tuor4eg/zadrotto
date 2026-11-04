import { getAnalyticsSettings } from "@/db/queries/analytics-settings";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getGoogleAnalyticsId } from "@/lib/analytics/google-analytics";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../admin-ui";
import { saveAnalyticsSettingsAction } from "./actions";

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdminUser();
  const [settings, query] = await Promise.all([getAnalyticsSettings(), searchParams]);
  const measurementId = getGoogleAnalyticsId();
  return <section className="grid max-w-2xl gap-5">
    <PageHeader title="Статистика" description="Управление Google Analytics." />
    {query.saved === "1" ? <p role="status" className="text-sm text-emerald-800">Настройки сохранены.</p> : null}
    <form action={saveAnalyticsSettingsAction} className="grid gap-4 rounded-lg border border-stone-200 bg-white p-5 text-sm">
      <label className="flex items-start gap-3"><input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="mt-1" /><span>Включить Google Analytics</span></label>
      <p className="text-stone-600">По умолчанию статистика выключена. При включении аналитика загружается только после отдельного согласия посетителя. При выключении скрипты не загружаются, события не отправляются, пункт Cookies в футере скрыт.</p>
      <p className="text-stone-600">{measurementId ? `Идентификатор: ${measurementId}` : "Идентификатор Google Analytics не настроен. Даже при включённом флаге аналитика не будет загружаться."}</p>
      <Button type="submit" className="w-fit">Сохранить</Button>
    </form>
  </section>;
}
