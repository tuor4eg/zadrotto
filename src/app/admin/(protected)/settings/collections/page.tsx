import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { getCollectionSettings } from "@/db/queries/collection-settings";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { SettingsSectionHeader } from "../settings-section-header";
import { updateCollectionSettingsAction } from "./actions";

export default async function CollectionSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const [limits, params] = await Promise.all([getCollectionSettings(), searchParams]);
  const messages: AdminToast[] = [
    ...(params.updated === "1" ? [{ id: "updated", tone: "success" as const, text: "Настройки подборок сохранены." }] : []),
    ...(params.error ? [{ id: "error", tone: "error" as const, text: "Укажите положительные целые числа не больше 2 147 483 647." }] : []),
  ];
  return <section>
    <AdminToasts clearParams={["error", "updated"]} messages={messages} />
    <SettingsSectionHeader icon={<Library />} title="Подборки" description="Ограничения содержимого одной подборки." />
    <form action={updateCollectionSettingsAction} className="mt-5 grid max-w-2xl gap-5 rounded-lg border border-stone-200 bg-white p-5">
      <label className="grid gap-2 text-sm font-medium">Максимум блоков в подборке
        <Input className="max-w-48" name="maxBlocks" type="number" min={1} max={2_147_483_647} step={1} required defaultValue={limits.maxBlocks} />
      </label>
      <label className="grid gap-2 text-sm font-medium">Максимум записей в подборке
        <Input className="max-w-48" name="maxEntries" type="number" min={1} max={2_147_483_647} step={1} required defaultValue={limits.maxEntries} />
        <span className="font-normal text-stone-500">Одиночные записи и участники всех наборов считаются вместе.</span>
      </label>
      <p className="text-sm text-stone-500">Новые лимиты применяются при сохранении подборок. Существующее содержимое автоматически не сокращается.</p>
      <div><Button type="submit">Сохранить</Button></div>
    </form>
  </section>;
}
