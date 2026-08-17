import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { getAdminMediaTypeAccessOptions } from "@/db/queries/media-types";
import { achievementMechanicRegistry } from "@/lib/achievements/catalog";
import { PageHeader } from "../../admin-ui";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { AchievementConfigurationFields } from "../achievement-configuration-fields";
import { createAchievementAction } from "../actions";
import { getAchievementErrorMessage } from "../messages";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewAchievementPage({ searchParams }: Props) {
  const query = await searchParams
  const [mediaTypes, series] = await Promise.all([
    getAdminMediaTypeAccessOptions(),
    getAdminFranchiseOptions(),
  ])
  const initialMechanic = achievementMechanicRegistry[0]!
  const errorMessage = query.error === "save"
    ? "Не удалось создать ачивку."
    : getAchievementErrorMessage(query.error)
  const toastMessages = [
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]
  return <div className="mx-auto max-w-2xl">
    <AdminToasts clearParams={["error"]} messages={toastMessages} />
    <PageHeader
      title="Новая ачивка"
      description="Создайте общие данные и первый уровень. Дополнительные уровни можно добавить после сохранения."
      aside={<Link className={buttonVariants({ variant: "outline" })} href="/admin/achievements"><ArrowLeft />Назад</Link>}
    />
    <Card className="mt-5">
      <CardContent className="pt-5">
        <form action={createAchievementAction} className="grid gap-5">
          <div className="grid gap-2"><Label htmlFor="achievement-name">Название</Label><Input id="achievement-name" name="name" required /></div>
          <div className="grid gap-2"><Label htmlFor="achievement-description">Описание</Label><Textarea id="achievement-description" name="description" required /></div>
          <AchievementConfigurationFields
            initialMechanic={initialMechanic.code}
            initialParams={{}}
            mechanics={achievementMechanicRegistry.map((mechanic) => ({
              code: mechanic.code,
              label: mechanic.label,
              params: mechanic.params.map(({ code, label, type }) => ({ code, label, type })),
            }))}
            mediaTypes={mediaTypes.map(({ code, name }) => ({ code, name }))}
            series={series
              .filter((item) => item.publicationStatus === "published")
              .map(({ id, originalTitle, title }) => ({ id, originalTitle, title }))}
          />
          <div className="grid gap-2">
            <Label htmlFor="first-level-threshold">Порог первого уровня</Label>
            <Input id="first-level-threshold" name="firstLevelThreshold" type="number" min={1} defaultValue={1} required />
            <p className="text-xs text-stone-500">Первый уровень создаётся автоматически с номером 1.</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" value="1" defaultChecked />Выдавать ачивку</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showWhenLocked" value="1" defaultChecked />Показывать ачивку до получения</label>
          <Button type="submit">Создать</Button>
        </form>
      </CardContent>
    </Card>
  </div>;
}
