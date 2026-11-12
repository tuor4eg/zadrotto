import { Layers3 } from "lucide-react";
import { getTierListSettings, getTierTemplates } from "@/db/queries/tier-lists";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "../settings-section-header";
import { saveSettingsAction } from "../../tier-lists/actions";
import { TierListToasts } from "../../tier-lists/tier-list-toasts";
import { TierTemplateTable } from "./template-table";

const labels = { maxEntries: "Записей в тир-листе", maxDrafts: "Черновиков на автора", maxPublished: "Публикаций на автора", publicationsPerDay: "Публикаций за сутки", creationsPerDay: "Созданий за сутки", maxLevels: "Уровней" };
export default async function TierSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [settings, templates, params] = await Promise.all([getTierListSettings(), getTierTemplates(), searchParams]);
  return <div className="grid gap-5"><SettingsSectionHeader icon={<Layers3 />} title="Тир-листы" description="Лимиты и шаблоны уровней. Изменение шаблона не меняет уже созданные тир-листы." />
    <TierListToasts error={params.error} saved={params.saved} />
    <form action={saveSettingsAction} className="grid gap-5 rounded-lg border border-stone-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(labels).map(([key, label]) => <label className="grid gap-2 text-sm font-medium" key={key}>{label}<Input name={key} type="number" required min={1} max={key === "maxLevels" ? 20 : 1000} defaultValue={settings[key as keyof typeof settings]} /></label>)}<div className="sm:col-span-2 lg:col-span-3"><Button type="submit">Сохранить лимиты</Button></div></form>
    <TierTemplateTable templates={templates} />
  </div>;
}
