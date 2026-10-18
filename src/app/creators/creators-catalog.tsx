import { Avatar } from "@/components/ui/avatar";
import { resolveCreatorAvatarUrl } from "@/lib/creators/avatar-url";
import Link from "next/link";
import { CatalogCountBadge, CATALOG_TITLE_STYLES } from "@/components/archive/catalog-count";
import { getCatalogAlphabetGroup, getCatalogCountTier } from "@/lib/common/catalog-alphabet";
import type { PublicCreator } from "@/lib/media/public-creators";

export function CreatorCatalog({ items, selectedLetter, mediaType }: { items: readonly PublicCreator[]; selectedLetter?: string; mediaType?: string }) {
  const groups = new Map<string, PublicCreator[]>();
  for (const creator of items) {
    const group = selectedLetter ?? getCatalogAlphabetGroup(creator.name);
    const rows = groups.get(group) ?? [];
    rows.push(creator);
    groups.set(group, rows);
  }
  return <section aria-label="Создатели" className="border-t border-stone-300/60 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
    <div className="columns-1 gap-6 lg:columns-2 lg:[column-rule:1px_solid_rgba(120,113,108,0.38)]">
      {[...groups].map(([group, rows]) => <section key={group} aria-labelledby={`creator-group-${encodeURIComponent(group)}`} className="mb-4">
        <ul>{rows.map((creator, index) => <li key={creator.id} className="break-inside-avoid">
          {index === 0 ? <h2 id={`creator-group-${encodeURIComponent(group)}`} className="break-after-avoid rounded-sm border-y border-stone-400/35 bg-[linear-gradient(90deg,rgba(190,174,138,0.78),rgba(225,214,186,0.58))] px-2.5 py-1.5 font-serif text-xl font-semibold leading-none text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">{group}</h2> : null}
          <Link href={`/archive?creator=${encodeURIComponent(creator.slug)}${mediaType ? `&type=${encodeURIComponent(mediaType)}` : ""}`} className="group flex items-center justify-between gap-4 border-b border-stone-300/45 px-2.5 py-2 transition-colors hover:bg-stone-50/60">
          <Avatar name={creator.name} src={resolveCreatorAvatarUrl(creator.avatarObjectKey ?? null)} className="size-10" />
          <span className="min-w-0 flex-1">
          <span className={`${CATALOG_TITLE_STYLES[getCatalogCountTier(creator.mediaItemsCount)]} min-w-0 flex-1 break-words font-serif leading-tight text-stone-950 group-hover:underline group-hover:decoration-stone-400 group-hover:underline-offset-4`}>{creator.name}</span>
          <span className="mt-1 flex flex-wrap gap-1" aria-label="Роли">
            {creator.roles?.map(role => <span key={role.code} className="rounded-full bg-stone-300/45 px-2 py-0.5 text-xs leading-none text-stone-600">{role.name}</span>)}
          </span>
          </span>
          <CatalogCountBadge count={creator.mediaItemsCount} />
        </Link></li>)}</ul>
      </section>)}
    </div>
  </section>;
}
