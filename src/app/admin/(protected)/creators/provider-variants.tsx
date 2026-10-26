import { Button } from "@/components/ui/button";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { isCoverProviderCode } from "@/lib/covers/types";
import { reopenCreatorAction } from "./actions";

export function CreatorProviderVariants({ variants, bindings = [] }: {
  variants: readonly { id: number; provider: string; externalCreatorName: string }[];
  bindings?: readonly { id: number; provider: string; externalCreatorId: string; externalCreatorName: string | null; active?: boolean }[];
}) {
  if (!variants.length && !bindings.length) return <p className="text-sm text-stone-500">Нет соответствий провайдеров</p>;
  return <ul className="grid gap-2 text-sm">{bindings.map(binding => <li key={`binding:${binding.id}`} className="min-w-0">
    <p className="text-xs font-medium text-stone-500">{isCoverProviderCode(binding.provider) ? COVER_PROVIDER_LABELS[binding.provider] : binding.provider} · ID {binding.externalCreatorId} · Привязка по ID · {binding.active === false ? "Историческая (неактивна)" : "Действует"}</p>
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="min-w-0 break-words text-stone-800">{binding.externalCreatorName ?? `#${binding.externalCreatorId}`}</span>
      {binding.provider === "bgg" ? <a href={`https://boardgamegeek.com/boardgamedesigner/${binding.externalCreatorId}`} target="_blank" rel="noreferrer" className="underline">BGG</a> : null}
      {binding.provider === "fantlab" ? <a href={`https://fantlab.ru/autor${binding.externalCreatorId}`} target="_blank" rel="noreferrer" className="underline">FantLab</a> : null}
      {binding.provider === "anilist" ? <a href={`https://anilist.co/${binding.externalCreatorId.startsWith("person:") ? "staff" : "studio"}/${binding.externalCreatorId.split(":")[1]}`} target="_blank" rel="noreferrer" className="underline">AniList</a> : null}
      {binding.provider === "tmdb" ? <a href={`https://www.themoviedb.org/${binding.externalCreatorId.startsWith("person:") ? "person" : binding.externalCreatorId.startsWith("network:") ? "network" : "company"}/${binding.externalCreatorId.split(":")[1]}`} target="_blank" rel="noreferrer" className="underline">TMDB</a> : null}
      {binding.active !== false && ["bgg", "igdb", "rawg", "tmdb", "fantlab", "anilist"].includes(binding.provider) ? <form action={reopenCreatorAction}><input type="hidden" name="bindingId" value={binding.id} /><Button type="submit" variant="outline" size="sm">Вернуть в заявки</Button></form> : null}
    </div>
  </li>)}{variants.map(variant => <li key={`mapping:${variant.id}`} className="min-w-0">
    <p className="text-xs font-medium text-stone-500">{isCoverProviderCode(variant.provider) ? COVER_PROVIDER_LABELS[variant.provider] : variant.provider} · Соответствие имени</p>
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="min-w-0 break-words text-stone-800">{variant.externalCreatorName}</span>
      <form action={reopenCreatorAction}><input type="hidden" name="mappingId" value={variant.id} />
        <Button type="submit" variant="outline" size="sm" aria-label={`Вернуть в заявки ${variant.externalCreatorName}`}>Вернуть в заявки</Button>
      </form>
    </div>
  </li>)}</ul>;
}
