import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AchievementImagePicker } from "@/components/achievements/achievement-image-picker";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { getAdminAchievementById } from "@/db/queries/achievements";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { getAdminMediaTypeAccessOptions } from "@/db/queries/media-types";
import { achievementMechanicRegistry } from "@/lib/achievements/catalog";
import { PageHeader } from "../../../admin-ui";
import { AdminToasts, type AdminToast } from "../../../admin-toasts";
import { AchievementConfigurationFields } from "../../achievement-configuration-fields";
import { AchievementLevelsTab } from "../../achievement-levels-tab";
import { updateAchievementAction } from "../../actions";
import { getAchievementErrorMessage } from "../../messages";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    error?: string;
    tab?: string;
    updated?: string;
  }>;
};

export default async function EditAchievementPage({ params, searchParams }: Props) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const tab = query.tab === "levels" ? "levels" : "general";
  const [item, mediaTypes, series] = await Promise.all([
    getAdminAchievementById(id),
    tab === "general" ? getAdminMediaTypeAccessOptions() : Promise.resolve([]),
    tab === "general" ? getAdminFranchiseOptions() : Promise.resolve([]),
  ]);
  if (!item) notFound();

  const successMessage = query.updated === "1"
    ? "Изменения сохранены."
    : query.created === "1"
      ? "Ачивка создана. Можно добавить дополнительные уровни."
      : null
  const errorMessage = getAchievementErrorMessage(query.error)
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]

  return <div className="mx-auto max-w-3xl">
    <AdminToasts clearParams={["created", "error", "updated"]} messages={toastMessages} />
    <PageHeader
      title="Редактирование ачивки"
      description={item.name}
      aside={<Link className={buttonVariants({ variant: "outline" })} href="/admin/achievements"><ArrowLeft />Назад</Link>}
    />
    <nav className="mt-5 flex gap-2 border-b border-stone-200" aria-label="Разделы ачивки">
      {[
        ["general", "Общие"],
        ["levels", "Уровни"],
      ].map(([value, label]) => (
        <Link
          key={value}
          href={`/admin/achievements/${item.id}/edit?tab=${value}`}
          className={`px-3 py-2 text-sm ${tab === value ? "border-b-2 border-stone-950 font-medium text-stone-950" : "text-stone-600"}`}
        >
          {label}
        </Link>
      ))}
    </nav>

    {tab === "general" ? (
      <Card className="mt-5">
        <CardContent className="pt-5">
          <form action={updateAchievementAction} className="grid gap-5">
            <input type="hidden" name="achievementId" value={item.id} />
            <div className="grid gap-2"><Label htmlFor="achievement-name">Название</Label><Input id="achievement-name" name="name" defaultValue={item.name} required /></div>
            <div className="grid gap-2"><Label htmlFor="achievement-description">Описание</Label><Textarea id="achievement-description" name="description" defaultValue={item.description} required /></div>
            <AchievementConfigurationFields
              conditionLocked={item.hasAwards}
              initialMechanic={item.mechanic}
              initialParams={item.params}
              mechanics={achievementMechanicRegistry.map((mechanic) => ({
                code: mechanic.code,
                label: mechanic.label,
                params: mechanic.params.map(({ code, label, type }) => ({ code, label, type })),
              }))}
              mediaTypes={mediaTypes.map(({ code, name }) => ({ code, name }))}
              series={series.map(({ id: seriesId, title }) => ({ id: seriesId, title }))}
            />
            <div className="grid gap-3">
              <Label htmlFor="achievement-image">Базовое изображение</Label>
              <AchievementImagePicker inputId="achievement-image" initialImageUrl={item.imageUrl} />
              <p className="text-xs text-stone-500">Используется для уровней без собственного изображения.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" value="1" defaultChecked={item.enabled} />Выдавать ачивку</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showWhenLocked" value="1" defaultChecked={item.showWhenLocked} />Показывать ачивку до получения</label>
            <Button type="submit">Сохранить</Button>
          </form>
        </CardContent>
      </Card>
    ) : (
      <Card className="mt-5">
        <CardContent className="pt-5">
          <AchievementLevelsTab
            achievementId={item.id}
            achievementName={item.name}
            levels={item.levels.map((level) => ({
              description: level.description,
              id: level.id,
              imageUrl: level.imageUrl,
              isAwarded: level.isAwarded,
              level: level.level,
              name: level.name,
              threshold: level.threshold,
            }))}
          />
        </CardContent>
      </Card>
    )}
  </div>;
}
