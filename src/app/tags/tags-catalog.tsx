import Link from "next/link";
import { CatalogCountBadge, CATALOG_TITLE_STYLES } from "@/components/archive/catalog-count";
import { getCatalogAlphabetGroup, getCatalogCountTier } from "@/lib/common/catalog-alphabet";
import type { PublicTag } from "@/lib/tags/public-tags";

export function TagCatalog({ items, selectedLetter }: { items: readonly PublicTag[]; selectedLetter?: string }) {
  const groups = new Map<string, PublicTag[]>();
  for (const tag of items) {
    const group = selectedLetter ?? getCatalogAlphabetGroup(tag.title);
    const rows = groups.get(group) ?? [];
    rows.push(tag);
    groups.set(group, rows);
  }
  return <section aria-label="Теги" className="border-t border-stone-300/60 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
    <div className="columns-1 gap-6 lg:columns-2 lg:[column-rule:1px_solid_rgba(120,113,108,0.38)]">
      {[...groups].map(([group, rows]) => <section key={group} aria-labelledby={`tag-group-${encodeURIComponent(group)}`} className="mb-4">
        <ul>{rows.map((tag, index) => <li key={tag.id} className="break-inside-avoid">
          {index === 0 ? <h2 id={`tag-group-${encodeURIComponent(group)}`} className="break-after-avoid rounded-sm border-y border-stone-400/35 bg-[linear-gradient(90deg,rgba(190,174,138,0.78),rgba(225,214,186,0.58))] px-2.5 py-1.5 font-serif text-xl font-semibold leading-none text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">{group}</h2> : null}
          <Link href={`/archive?tag=${encodeURIComponent(tag.code)}`} className="group flex items-center justify-between gap-4 border-b border-stone-300/45 px-2.5 py-2 transition-colors hover:bg-stone-50/60">
          <span className={`${CATALOG_TITLE_STYLES[getCatalogCountTier(tag.mediaItemsCount)]} min-w-0 break-words font-serif leading-tight text-stone-950 group-hover:underline group-hover:decoration-stone-400 group-hover:underline-offset-4`}>{tag.title}</span>
          <CatalogCountBadge count={tag.mediaItemsCount} />
        </Link></li>)}</ul>
      </section>)}
    </div>
  </section>;
}
