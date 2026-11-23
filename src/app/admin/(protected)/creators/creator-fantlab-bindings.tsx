import { Button } from "@/components/ui/button";
import { assignCreatorFantlabBindingAction } from "./avatar-actions";

export function CreatorFantlabBindings({ creatorId, hasActiveBinding, variants }: {
  creatorId: number;
  hasActiveBinding: boolean;
  variants: { mappingId: number; provider: string; externalCreatorName: string }[];
}) {
  const fantlabVariants = variants.filter(value => value.provider === "fantlab");
  return <details className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">
      {hasActiveBinding ? "Исправить привязку FantLab" : "Добавить привязку FantLab"}
    </summary>
    {hasActiveBinding ? <>
      <p className="mt-3 text-sm text-stone-500">Новый ID заменит действующие привязки FantLab для этой карточки и её вариантов имени. Если прежняя привязка используется в записях, исправьте сопоставление через заявки.</p>
      <form action={assignCreatorFantlabBindingAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="creatorId" value={creatorId} />
        <input type="hidden" name="allVariants" value="1" />
        <label className="grid gap-1 text-sm">Верный ID автора FantLab<input name="externalCreatorId" required type="number" min="1" className="rounded-md border px-3 py-2" /></label>
        <Button type="submit" variant="outline">Проверить и заменить ID</Button>
      </form>
    </> : <div className="mt-3 grid gap-3">
      {(fantlabVariants.length ? fantlabVariants : [null]).map(variant => <form key={variant?.mappingId ?? "new"} action={assignCreatorFantlabBindingAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="creatorId" value={creatorId} />
        {variant ? <input type="hidden" name="mappingId" value={variant.mappingId} /> : null}
        <label className="grid gap-1 text-sm">{variant?.externalCreatorName ?? "Автор FantLab"}<input name="externalCreatorId" aria-label="ID автора FantLab" required type="number" min="1" className="rounded-md border px-3 py-2" /></label>
        <Button type="submit" variant="outline">Проверить и назначить ID</Button>
      </form>)}
    </div>}
  </details>;
}
