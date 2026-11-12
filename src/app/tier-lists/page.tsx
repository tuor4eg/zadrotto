import { ArchivePageHeading } from "@/components/archive/archive-page-heading"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { PaginationNav } from "@/components/pagination-nav"
import { buttonVariants } from "@/components/ui/button"
import {
  getMyTierListStatusCounts,
  getTierListCatalogue,
  listPublishedTierListAuthors,
} from "@/db/queries/tier-lists"
import { getCurrentAuthor } from "@/lib/auth/author-auth"
import { parsePage, parsePageSize } from "@/lib/common/pagination"

import { TierListCatalogControls } from "./tier-list-catalog-controls"
import {
  DEFAULT_TIER_LIST_CATALOG_PAGE_SIZE,
  parseTierListCatalogAuthorId,
  parseTierListCatalogSort,
  parseTierListMineStatus,
  TIER_LIST_CATALOG_PAGE_SIZE_OPTIONS,
  type TierListMineStatus,
} from "./tier-list-catalog-logic"
import { TierListCatalogTable } from "./tier-list-catalog-table"
import { TierListViewToggle } from "./tier-list-view-toggle"
import { LocalTierDraftCard } from "./local-tier-draft-card"

export const metadata: Metadata = {
  title: "Тир-листы",
  description: "Распределяйте записи по уровням и делитесь результатом.",
}

type TierListsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key]

  return typeof value === "string" ? value : ""
}

function formatTierListsFound(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count)
  const label =
    plural === "one" ? "тир-лист" : plural === "few" ? "тир-листа" : "тир-листов"

  return `Найдено ${count} ${label}`
}

export default async function TierListsPage({ searchParams }: TierListsPageProps) {
  const [params, author] = await Promise.all([searchParams, getCurrentAuthor()])
  const requestedMine = readParam(params, "view") === "mine" || readParam(params, "mine") === "1"
  const view = author && requestedMine ? "mine" : "all"
  const searchQuery = readParam(params, "q").trim().slice(0, 200)
  const sort = parseTierListCatalogSort(readParam(params, "sort"))
  const status = parseTierListMineStatus(readParam(params, "status"))
  const authorId = view === "all" ? parseTierListCatalogAuthorId(readParam(params, "author")) : null
  const pageSize = parsePageSize(
    readParam(params, "pageSize"),
    TIER_LIST_CATALOG_PAGE_SIZE_OPTIONS,
    DEFAULT_TIER_LIST_CATALOG_PAGE_SIZE,
  )
  const [catalog, authors, statusCounts] = await Promise.all([
    getTierListCatalogue({
      q: searchQuery,
      sort,
      mine: view === "mine",
      viewerId: author?.id,
      authorId: authorId ?? undefined,
      page: parsePage(readParam(params, "page")),
      pageSize,
      status: view === "mine" && status !== "all" ? status : undefined,
    }),
    view === "all" ? listPublishedTierListAuthors() : Promise.resolve([]),
    view === "mine" && author ? getMyTierListStatusCounts(author.id) : Promise.resolve(null),
  ])
  const counts: Record<TierListMineStatus, number> = statusCounts ?? {
    all: 0,
    published: 0,
    draft: 0,
    hidden: 0,
  }
  const paginationSearchParams = {
    author: authorId ? String(authorId) : undefined,
    pageSize: pageSize !== DEFAULT_TIER_LIST_CATALOG_PAGE_SIZE ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    sort: sort !== "newest" ? sort : undefined,
    status: view === "mine" && status !== "all" ? status : undefined,
    view: view === "mine" ? "mine" : undefined,
  }
  const hasActiveFilters =
    Boolean(searchQuery) ||
    authorId !== null ||
    sort !== "newest" ||
    (view === "mine" && status !== "all")
  const heading =
    view === "mine" ? "Ваши тир-листы." : "Распределяйте записи по уровням и делитесь результатом."

  return (
    <>
      <header className="relative z-20 p-4 pb-3 sm:p-6 sm:pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ArchivePageHeading title="Тир-листы" description={heading} />
          {author ? <TierListViewToggle view={view} /> : null}
        </div>

        <div className="mt-4">
            <Link
              href="/tier-lists/new"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              + Создать тир-лист
            </Link>
        </div>

        <Suspense fallback={null}>
          <TierListCatalogControls
            authors={authors}
            authorId={authorId}
            currentAuthorId={author?.id ?? null}
            searchQuery={searchQuery}
            sort={sort}
            status={status}
            statusCounts={view === "mine" ? counts : null}
            view={view}
          />
        </Suspense>
      </header>

      {!author ? <LocalTierDraftCard /> : null}

      <section aria-labelledby="tier-lists-title" className="flex-1 px-2 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2 px-2 sm:px-0">
          <h2
            id="tier-lists-title"
            className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
          >
            {view === "mine" ? "Мои тир-листы" : "Все тир-листы"}
          </h2>
          <p className="text-sm text-stone-600">{formatTierListsFound(catalog.totalCount)}</p>
        </div>

        {catalog.items.length === 0 ? (
          <p className="mt-6 text-sm text-stone-600">
            {hasActiveFilters
              ? "По вашему запросу тир-листы не найдены."
              : view === "mine"
                ? "Тир-листов пока нет. Создайте первый."
                : "Опубликованных тир-листов пока нет."}
          </p>
        ) : (
          <TierListCatalogTable items={catalog.items} mine={view === "mine"} />
        )}
      </section>

      <div className="border-t border-stone-400/45 bg-amber-50/20 px-4 py-3 [&>nav]:border-0 [&>nav]:bg-transparent [&>nav]:p-0 [&>nav]:shadow-none sm:px-4">
        <PaginationNav
          basePath="/tier-lists"
          itemLabel="тир-листов"
          page={catalog.page}
          pageSize={catalog.pageSize}
          pageSizeOptions={TIER_LIST_CATALOG_PAGE_SIZE_OPTIONS}
          searchParams={paginationSearchParams}
          showPageJump
          totalCount={catalog.totalCount}
          totalPages={catalog.totalPages}
          variant="archive"
        />
      </div>
    </>
  )
}
