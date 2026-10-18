import { CreatorRoleIcon } from "@/components/archive/creator-role-icon";
import { Avatar } from "@/components/ui/avatar";
import { resolveCreatorAvatarUrl } from "@/lib/creators/avatar-url";
import Link from "next/link";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { X } from "lucide-react";
import { MediaItemCreatorLinks } from "@/components/archive/media-item-creator-links";

export function ArchiveSelectedCreator({ creator, clearHref, adminCanEdit = false }: {
  creator: { roles?: readonly { code: string; name: string }[]; id: number; name: string; avatarObjectKey?: string | null; series: readonly { id: number; code: string; title: string }[]; pseudonymAuthors?: readonly { id: number; name: string; slug: string }[]; pseudonyms?: readonly { id: number; name: string; slug: string }[] };
  clearHref: string;
  adminCanEdit?: boolean;
}) {
  return <section aria-label="Выбранный создатель" className="archive-paper archive-panel flex min-w-0 flex-wrap items-center gap-3 border-amber-300/70 bg-amber-100/75 px-4 py-2.5 text-sm shadow-md">
    <Avatar name={creator.name} src={resolveCreatorAvatarUrl(creator.avatarObjectKey ?? null)} className="size-12 text-base" />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div className="break-words font-semibold text-stone-900">Создатель: {creator.name}{creator.pseudonymAuthors?.length ? <span className="font-normal"> (псевдоним для: <MediaItemCreatorLinks creators={creator.pseudonymAuthors} />)</span> : null}{creator.pseudonyms?.length ? <span className="font-normal"> (псевдонимы: <MediaItemCreatorLinks creators={creator.pseudonyms} />)</span> : null}</div>
      {creator.roles?.length ? <div aria-label="Роли создателя" className="flex flex-wrap gap-1.5">
        {creator.roles.map(role => <span key={role.code} className="inline-flex items-center gap-1 rounded-full bg-stone-300/45 px-2 py-0.5 text-xs text-stone-700">
          <CreatorRoleIcon code={role.code} className="size-3.5 shrink-0" />{role.name}
        </span>)}
      </div> : null}
      </div>
      {creator.series.length ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-700">
        <span>Связанные серии:</span>
        {creator.series.map((series) => <Link key={series.id} className="underline underline-offset-4 hover:text-stone-950" href={`/archive?series=${encodeURIComponent(series.code)}`}>{series.title}</Link>)}
      </div> : null}
    </div>
    {adminCanEdit ? <AdminEntityEditLink ariaLabel={`Редактировать создателя ${creator.name}`} href={`/admin/creators/${creator.id}/edit`} tooltipLabel="Редактировать создателя" tooltipSide="bottom" /> : null}
    <Link href={clearHref} aria-label="Сбросить выбранного создателя" className="grid size-9 shrink-0 place-items-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-950"><X className="size-4" /></Link>
  </section>;
}
