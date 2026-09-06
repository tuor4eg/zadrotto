import Link from "next/link"
import type { ReactNode } from "react"
import { Layers3 } from "lucide-react"

import { MediaItemTile } from "@/app/media-item-tile"
import { ResponsiveTileGrid } from "@/components/archive/responsive-tile-grid"
import type { getRandomPublishedFranchisePreview } from "@/db/queries/franchises"
import {
  ARCHIVE_LIST_TARGET_TILE_WIDTH,
  ARCHIVE_LIST_TILE_GAP,
} from "@/lib/archive/tile-grid-capacity"

type RandomFranchisePreview = Awaited<ReturnType<typeof getRandomPublishedFranchisePreview>>

const MOBILE_STRIP_CLASS_NAME =
  "flex overflow-x-auto pb-1 md:hidden [scrollbar-width:thin] [scrollbar-color:rgba(168,162,158,.45)_transparent]"

function RandomFranchiseMobileStrip({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className={MOBILE_STRIP_CLASS_NAME} style={{ gap: ARCHIVE_LIST_TILE_GAP }}>
      {children}
    </div>
  )
}

export function RandomFranchiseSectionFallback() {
  return (
    <section className="archive-paper archive-panel overflow-hidden p-4 sm:p-5" aria-hidden="true">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Layers3 className="size-5 text-red-950/70" aria-hidden="true" />
          <h2 className="font-serif text-2xl leading-none text-stone-950">Случайная серия</h2>
        </div>
      </div>
      <RandomFranchiseMobileStrip>
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="aspect-[2/3] shrink-0 rounded-md bg-stone-200/40"
            style={{ width: ARCHIVE_LIST_TARGET_TILE_WIDTH }}
          />
        ))}
      </RandomFranchiseMobileStrip>
      <div className="hidden grid-cols-3 content-start gap-2.5 md:grid md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="aspect-[2/3] rounded-md bg-stone-200/40" />
        ))}
      </div>
    </section>
  )
}

export async function RandomFranchiseSection({
  promise,
}: {
  promise: Promise<RandomFranchisePreview>
}) {
  const preview = await promise

  if (!preview) {
    return (
      <section className="archive-paper archive-panel p-4 sm:p-5" aria-labelledby="main-random-series-title">
        <div className="flex items-center gap-2">
          <Layers3 className="size-5 text-red-950/70" aria-hidden="true" />
          <h2 id="main-random-series-title" className="font-serif text-2xl leading-none text-stone-950">
            Случайная серия
          </h2>
        </div>
        <p className="py-12 text-center font-mono text-xs uppercase tracking-wider text-stone-500">
          Серия появится, когда в архиве будет хотя бы пять связанных записей.
        </p>
      </section>
    )
  }

  const tiles = preview.items.map((item) => ({
    currentAuthorScore: item.currentAuthorScore,
    href: `/media/${item.code}`,
    item,
    key: item.id,
  }))

  return (
    <section className="archive-paper archive-panel overflow-hidden p-4 sm:p-5" aria-labelledby="main-random-series-title">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <Layers3 className="size-5 shrink-0 text-red-950/70" aria-hidden="true" />
        <h2
          id="main-random-series-title"
          className="flex min-w-0 items-baseline gap-2 font-serif text-2xl leading-none text-stone-950"
        >
          <span className="shrink-0">Случайная серия</span>
          <Link
            href={`/series/${preview.franchise.code}`}
            className="min-w-0 truncate hover:text-red-950"
          >
            {preview.franchise.title}
          </Link>
        </h2>
      </div>
      <RandomFranchiseMobileStrip>
        {tiles.map((descriptor) => (
          <div
            key={descriptor.key}
            className="shrink-0"
            style={{ width: ARCHIVE_LIST_TARGET_TILE_WIDTH }}
          >
            <MediaItemTile
              currentAuthorScore={descriptor.currentAuthorScore}
              href={descriptor.href}
              item={descriptor.item}
            />
          </div>
        ))}
      </RandomFranchiseMobileStrip>
      <div className="hidden md:block">
        <ResponsiveTileGrid items={tiles} variant="archive" />
      </div>
    </section>
  )
}
