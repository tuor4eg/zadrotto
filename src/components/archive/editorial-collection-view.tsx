import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import { AuthorMediaStatusControls } from "@/app/author-media-status-controls";
import { ArchiveCover } from "@/app/media-item-tile";
import { EditorialDocumentRenderer } from "@/components/archive/editorial-document-renderer";
import type { getEditorialCollectionById } from "@/db/queries/editorial-collections";
import { formatScore } from "@/lib/ratings/score";

type Collection = NonNullable<Awaited<ReturnType<typeof getEditorialCollectionById>>>;

export function EditorialCollectionView({ collection, currentAuthor }: { collection: Collection; currentAuthor: boolean }) {
  return <article className="archive-paper archive-panel overflow-hidden">
    <header className="grid gap-5 p-5 sm:p-7">
      <nav aria-label="Хлебные крошки" className="flex flex-wrap gap-2 font-mono text-xs text-stone-600"><Link className="underline underline-offset-4" href="/collections">Подборки</Link><span>/</span><span aria-current="page">{collection.title}</span></nav>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,44%)] lg:items-start">
        <div className="min-w-0"><h1 className="font-serif text-4xl leading-tight sm:text-5xl">{collection.title}</h1>{collection.description ? <div className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-stone-700">{collection.description}</div> : null}</div>
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-stone-950/10 bg-[linear-gradient(135deg,#d9d1bd,#f2ead7)] shadow-sm">{collection.coverUrl ? <Image fill priority unoptimized className="object-cover" alt="" src={collection.coverUrl} /> : <div className="grid h-full place-items-center font-serif text-2xl text-stone-600">Подборка</div>}</div>
      </div>
    </header>
    <EditorialDocumentRenderer blocks={collection.blocks} mediaGroupClassName="md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2" renderMedia={(block) => {
      const { item, editorialComment, currentAuthorStatus } = block;
      const coverItem = { ...item, coverUrl: item.coverThumbUrl ?? item.coverUrl };
      return <div key={block.id} className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <Link href={`/media/${item.code}`} className="relative block aspect-[2/3] overflow-hidden rounded-md border border-stone-300/80 bg-stone-100 shadow-sm transition-transform hover:-translate-y-0.5"><ArchiveCover carrierFrame={false} item={coverItem} className="absolute inset-0 h-full w-full" /></Link>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link href={`/media/${item.code}`} className="font-semibold leading-tight text-stone-950 hover:underline hover:underline-offset-4">{item.title}</Link>
            {item.originalTitle ? <span className="text-sm text-stone-500">{item.originalTitle}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
            <span className="text-stone-500">{[item.releaseYear, item.mediaTypeName].filter(Boolean).join(" · ")}</span>
            <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600"><Star className="size-4 fill-current" />{formatScore(item.averageScore)}</span>
              {item.currentAuthorScore !== null ? <span className="text-stone-600">Моя оценка: {formatScore(item.currentAuthorScore)}</span> : null}
              {currentAuthor && item.currentAuthorScore === null ? <AuthorMediaStatusControls currentAuthorScore={item.currentAuthorScore} currentAuthorStatus={currentAuthorStatus} mediaItemCode={item.code} variant="tile" /> : null}
            </span>
          </div>
          {editorialComment ? <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-700">{editorialComment}</p> : null}
        </div>
      </div>;
    }} />
  </article>;
}
