import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { PublicSiteHeader } from "@/components/archive/public-site-header"
import { getPublishedEditorialCollections } from "@/db/queries/editorial-collections"
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header"

export const metadata: Metadata = {
  title: "Подборки",
  description: "Редакционные подборки записей архива.",
}

export const dynamic = "force-dynamic"

export default async function CollectionsPage() {
  const [items, headerState] = await Promise.all([
    getPublishedEditorialCollections(),
    getPublicSiteHeaderState(),
  ])

  return (
    <main className="archive-page flex min-h-dvh flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col">
          <div className="archive-paper archive-panel archive-stack archive-stack-left flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="shrink-0 p-5 pb-3 sm:p-6 sm:pb-4">
              <h1 className="font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
                Подборки
              </h1>
              <p className="mt-2 text-sm text-stone-600">
                Редакционные маршруты по архиву.
              </p>
            </header>

            <div className="min-h-0 flex-1 px-5 pb-5 sm:px-6 sm:pb-6">
              {items.length === 0 ? (
                <p className="text-sm text-stone-500">Опубликованных подборок пока нет.</p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/collections/${item.slug}`}
                      className="group relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-stone-900 shadow-md"
                    >
                      {item.coverUrl ? (
                        <Image
                          fill
                          unoptimized
                          src={item.coverUrl}
                          alt=""
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 bg-[linear-gradient(135deg,#44403c,#1c1917)]"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"
                      />
                      <span className="absolute inset-x-0 bottom-0 p-3 text-white">
                        <span className="block truncate text-lg font-semibold leading-tight drop-shadow">
                          {item.title}
                        </span>
                        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-stone-300">
                          {item.itemsCount} записей
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
