import { Button } from "@/components/ui/button";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { isCoverProviderCode } from "@/lib/covers/types";
import type { GenreProviderVariantGroup } from "@/lib/media/admin-genres";

export function GenreProviderVariants({ groups, reopenAction }: { groups: readonly GenreProviderVariantGroup[]; reopenAction?: (formData: FormData) => Promise<void> }) {
  if (groups.length === 0) return <p className="text-sm text-stone-500">Нет соответствий провайдеров</p>;
  return (
    <ul className="grid gap-2 text-sm">
      {groups.map((group) => (
        <li key={`${group.provider}:${group.mediaType}`} className="min-w-0">
          <div className="text-xs font-medium text-stone-500">
            {isCoverProviderCode(group.provider) ? COVER_PROVIDER_LABELS[group.provider] : group.provider}
            {" · "}{group.mediaTypeName}
          </div>
          {reopenAction && group.variants?.length ? <ul className="mt-1 grid gap-2">
            {group.variants.map((variant) => <li key={variant.mappingId} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-words text-stone-800">{variant.name}</span>
              <form action={reopenAction}>
                <input type="hidden" name="mappingId" value={variant.mappingId} />
                <Button type="submit" variant="outline" size="sm" disabled={variant.applying}
                  aria-label={`Вернуть в заявки ${variant.name}`}>
                  {variant.applying ? "Применяется…" : "Вернуть в заявки"}
                </Button>
              </form>
            </li>)}
          </ul> : <div className="break-words text-stone-800">{group.names.join(", ")}</div>}
        </li>
      ))}
    </ul>
  );
}
