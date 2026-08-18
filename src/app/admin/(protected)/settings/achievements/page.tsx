import { Trophy } from "lucide-react"

import { AchievementImagePicker } from "@/components/achievements/achievement-image-picker"
import { ImageUploadForm } from "@/components/forms/image-upload-form"
import { Button } from "@/components/ui/button"
import { getAchievementSettings } from "@/db/queries/achievement-settings"
import { getAchievementErrorMessage } from "../../achievements/messages"
import { AdminToasts, type AdminToast } from "../../admin-toasts"
import { SettingsSectionHeader } from "../settings-section-header"
import { updateAchievementSettingsAction } from "./actions"

type PageProps = { searchParams: Promise<{ error?: string; updated?: string }> }

export default async function AdminSettingsAchievementsPage({ searchParams }: PageProps) {
  const [settings, params] = await Promise.all([
    getAchievementSettings(),
    searchParams,
  ])
  const errorMessage = getAchievementErrorMessage(params.error)
  const messages = [
    ...(params.updated === "1" ? [{ id: "updated", tone: "success" as const, text: "Настройки ачивок сохранены." }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]

  return (
    <section>
      <AdminToasts clearParams={["error", "updated"]} messages={messages} />
      <SettingsSectionHeader
        icon={<Trophy />}
        title="Ачивки"
        description="Общие изображения и оформление витрины ачивок. Настройка действует для всех авторов."
      />

      <div className="mt-5 max-w-2xl">
        <ImageUploadForm action={updateAchievementSettingsAction} className="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-stone-800">Изображение для неполученной ачивки</p>
            <p className="text-sm leading-6 text-stone-500">
              Показывается на витрине, пока автор ещё не получил ачивку. Если файл не задан, показывается иконка замка.
            </p>
            <AchievementImagePicker
              initialImageUrl={settings.lockedImageUrl}
              inputId="locked-achievement-image"
              variant="locked"
            />
          </div>
          <Button type="submit">Сохранить</Button>
        </ImageUploadForm>
      </div>
    </section>
  )
}
