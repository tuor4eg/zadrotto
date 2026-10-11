import Image from "next/image";
import Link from "next/link";

import { EditorialDocumentRenderer } from "@/components/archive/editorial-document-renderer";
import type { getEditorialCollectionById } from "@/db/queries/editorial-collections";
import { EditorialCollectionEntryCard } from "@/components/archive/editorial-collection-entry-card";
import { EditorialEntryGroupTile } from "@/components/archive/editorial-entry-group-tile";
import { EntryGroupCarousel } from "@/components/archive/entry-group-carousel";
import { getEntryGroupSummary } from "@/lib/editorial-documents/entry-group-summary";

type Collection = NonNullable<Awaited<ReturnType<typeof getEditorialCollectionById>>>;
type CollectionMediaBlock = Extract<Collection["blocks"][number], { type: "media" }>;
type CollectionEntryGroupBlock = Extract<Collection["blocks"][number], { type: "entry_group" }>;

export function EditorialCollectionView({ collection, currentAuthor, ratingAuthor = null }: { collection: Collection; currentAuthor: boolean; ratingAuthor?: { name: string; code: string } | null }) {
  return <article className="archive-paper archive-panel overflow-hidden">
    <header className="grid gap-5 p-5 sm:p-7">
      <nav aria-label="Хлебные крошки" className="flex flex-wrap gap-2 font-mono text-xs text-stone-600"><Link className="underline underline-offset-4" href="/collections">Подборки</Link><span>/</span><span aria-current="page">{collection.title}</span></nav>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,44%)] lg:items-start">
        <div className="min-w-0"><h1 className="font-serif text-4xl leading-tight sm:text-5xl">{collection.title}</h1>{collection.description ? <div className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-stone-700">{collection.description}</div> : null}</div>
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-stone-950/10 bg-[linear-gradient(135deg,#d9d1bd,#f2ead7)] shadow-sm">{collection.coverUrl ? <Image fill priority unoptimized className="object-cover" alt="" src={collection.coverUrl} /> : <div className="grid h-full place-items-center font-serif text-2xl text-stone-600">Подборка</div>}</div>
      </div>
    </header>
    <EditorialDocumentRenderer<CollectionMediaBlock, CollectionEntryGroupBlock> blocks={collection.blocks} mediaGroupClassName="md:grid-cols-1 lg:grid-cols-2 lg:gap-x-10 xl:grid-cols-2" renderMedia={(block) => {
      return <EditorialCollectionEntryCard key={block.id} {...block} currentAuthor={currentAuthor} ratingAuthor={ratingAuthor} />;
    }} renderEntryGroup={(block) => {
      const summary = getEntryGroupSummary(block.items.map(({ item }) => item));
      return <section className="grid min-w-0 gap-4">
        {block.title ? <h2 className="font-serif text-3xl leading-tight text-stone-950 sm:text-4xl">{block.title}</h2> : null}
        <p className="text-sm text-stone-500">{summary.label}</p>
        <EntryGroupCarousel label={block.title || "Набор записей"}>
          {block.items.map((entry) => <div key={entry.mediaItemId} className="w-32 min-w-0 shrink-0 snap-start sm:w-36">
            <EditorialEntryGroupTile {...entry} currentAuthor={currentAuthor} ratingAuthor={ratingAuthor} />
          </div>)}
        </EntryGroupCarousel>
        {block.description ? <div className="whitespace-pre-wrap text-base leading-7 text-stone-700">{block.description}</div> : null}
      </section>;
    }} />
  </article>;
}
