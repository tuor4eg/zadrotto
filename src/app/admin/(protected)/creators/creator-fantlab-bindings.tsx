import { Button } from "@/components/ui/button";
import { assignCreatorFantlabBindingAction } from "./avatar-actions";

export function CreatorFantlabBindings({ creatorId, creatorName, bindings, variants }: {
  creatorId: number;
  creatorName?: string;
  bindings: { id: number; externalCreatorId: string }[];
  variants: { mappingId: number; provider: string; externalCreatorName: string }[];
}) {
  const fantlabVariants = variants.filter(value => value.provider === "fantlab");
  return <section className="grid max-w-3xl gap-3 rounded-lg border bg-white p-5">
    <h2 className="font-semibold">Привязка FantLab</h2>
    {bindings.map(binding => <p key={binding.id} className="text-sm">Подтверждённый автор: <a className="underline" href={`https://fantlab.ru/autor${binding.externalCreatorId}`} target="_blank" rel="noreferrer">{creatorName ? `${creatorName} · ` : ""}FantLab #{binding.externalCreatorId}</a></p>)}
    <p className="text-sm text-stone-500">ID проверяется через FantLab. При конфликте исправьте ID у соответствующего варианта имени. Несколько разных ID требуют ручного разрешения.</p>
    {(fantlabVariants.length ? fantlabVariants : [null]).map(variant => <form key={variant?.mappingId ?? "new"} action={assignCreatorFantlabBindingAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="creatorId" value={creatorId} />
      {variant ? <input type="hidden" name="mappingId" value={variant.mappingId} /> : null}
      <label className="grid gap-1 text-sm">{variant?.externalCreatorName ?? "Автор FantLab"}<input name="externalCreatorId" aria-label="ID автора FantLab" required type="number" min="1" className="rounded-md border px-3 py-2" /></label>
      <Button type="submit" variant="outline">Проверить и назначить ID</Button>
    </form>)}
    {bindings.length > 1 ? <form action={assignCreatorFantlabBindingAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="creatorId" value={creatorId} /><input type="hidden" name="allVariants" value="1" />
      <label className="grid gap-1 text-sm">Единый ID для всех вариантов<input name="externalCreatorId" required type="number" min="1" className="rounded-md border px-3 py-2" /></label>
      <Button type="submit" variant="outline">Подтвердить ID для всех вариантов</Button>
    </form> : null}

  </section>;
}
