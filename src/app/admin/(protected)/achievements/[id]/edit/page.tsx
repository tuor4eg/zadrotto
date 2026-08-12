import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AchievementImagePicker } from "@/components/achievements/achievement-image-picker";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { getAdminAchievementById } from "@/db/queries/achievements";
import { PageHeader } from "../../../admin-ui";
import { updateAchievementAction } from "../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; updated?: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  "image-invalid": "Нужен корректный JPG, PNG или WebP.",
  "image-too-large": "Изображение должно быть не больше 5 МБ.",
  "image-upload": "Не удалось загрузить изображение в хранилище.",
  invalid: "Заполни название и описание.",
  save: "Не удалось сохранить изменения.",
};

export default async function EditAchievementPage({ params, searchParams }: Props) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const item = await getAdminAchievementById(id);
  if (!item) notFound();

  return <div className="mx-auto max-w-2xl">
    <PageHeader title="Редактирование ачивки" description={item.name} aside={<Link className={buttonVariants({ variant: "outline" })} href="/admin/achievements"><ArrowLeft />Назад</Link>} />
    <Card className="mt-5"><CardContent className="pt-5">
      <form action={updateAchievementAction} className="grid gap-5">
        <input type="hidden" name="achievementId" value={item.id} />
        {query.updated === "1" ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Ачивка сохранена.</p> : null}
        {query.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{ERROR_MESSAGES[query.error] ?? "Не удалось сохранить ачивку."}</p> : null}
        <div className="grid gap-2"><Label htmlFor="achievement-name">Название</Label><Input id="achievement-name" name="name" defaultValue={item.name} required /></div>
        <div className="grid gap-2"><Label htmlFor="achievement-description">Описание</Label><Textarea id="achievement-description" name="description" defaultValue={item.description} required /></div>
        <div className="grid gap-3"><Label htmlFor="achievement-image">Изображение</Label>
          <AchievementImagePicker inputId="achievement-image" initialImageUrl={item.imageUrl} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" value="1" defaultChecked={item.enabled} />Выдавать ачивку</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showWhenLocked" value="1" defaultChecked={item.showWhenLocked} />Показывать ачивку до получения</label>
        <Button type="submit">Сохранить</Button>
      </form>
    </CardContent></Card>
  </div>;
}
