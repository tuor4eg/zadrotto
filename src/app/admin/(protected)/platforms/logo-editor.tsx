import { PlatformLogo } from "@/components/archive/platform-logo";
import { Button } from "@/components/ui/button";
import { uploadPlatformLogoAction, clearPlatformLogoAction, changePlatformLogoModeAction, syncPlatformLogoAction } from "./logo-actions";

export function PlatformLogoEditor({ platform, error, updated }: { platform: {
  id: number; name: string; importedLogoProvider: string | null; importedLogoExternalId: string | null; logoMode: "exact" | "combined"; logoVersion: number; logoUrl: string | null; manualLogoObjectKey: string | null;
}; error?: boolean; updated?: boolean }) {
  const identity = <><input type="hidden" name="platformId" value={platform.id} /><input type="hidden" name="logoVersion" value={platform.logoVersion} /></>;
  return <section className="grid gap-4">
    <h2 className="text-sm font-medium">Логотип платформы</h2>
    <PlatformLogo name={platform.name} logoUrl={platform.logoUrl} size={96} />
    <p className="text-sm text-stone-600">Источник: {platform.manualLogoObjectKey?"ручная загрузка":platform.logoUrl?platform.importedLogoProvider?.toUpperCase():"название платформы (логотип отсутствует)"}</p>
    {error ? <p role="alert" className="text-sm text-red-700">Не удалось сохранить логотип. Проверьте файл и обновите страницу, если платформа изменилась.</p> : null}
    {updated ? <p role="status" className="text-sm text-green-700">Изменения сохранены. Запрошенное обновление выполняется в фоне.</p> : null}
    <form action={changePlatformLogoModeAction} className="grid gap-2">{identity}
      <label htmlFor="platform-logo-mode" className="text-sm">Тип платформы</label>
      <select id="platform-logo-mode" name="logoMode" defaultValue={platform.logoMode} className="rounded-md border px-3 py-2"><option value="exact">Точная платформа</option><option value="combined">Объединённая платформа</option></select>
      <p className="text-xs text-stone-500">Для объединённой платформы логотип выбирается вручную из предложенных вариантов.</p>
      <div><Button type="submit" variant="outline">Сохранить тип</Button></div>
    </form>
    <form action={uploadPlatformLogoAction} className="grid gap-2">{identity}
      <label htmlFor="platform-logo-file" className="text-sm">Ручной логотип</label>
      <input id="platform-logo-file" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="block w-full min-w-0 text-sm" />
      <p className="text-xs text-stone-500">PNG, JPEG или WebP до 5 МБ. Изображение сохраняется целиком без обрезки.</p>
      <div><Button type="submit">Загрузить</Button></div>
    </form>
    {platform.manualLogoObjectKey ? <form action={clearPlatformLogoAction}>{identity}<Button type="submit" variant="outline">Удалить ручной логотип</Button><p className="mt-2 text-xs text-stone-500">Вернётся подтверждённый логотип провайдера, если он доступен для этой платформы.</p></form> : null}
    <form action={syncPlatformLogoAction}>{identity}<Button type="submit" variant="outline">Обновить логотип у провайдера</Button></form>
  </section>;
}
