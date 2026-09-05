import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { PublicSiteHeader } from "@/components/archive/public-site-header"
import { PaginationNav } from "@/components/pagination-nav"
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts"
import { buttonVariants } from "@/components/ui/button"
import {
  getLatestPublishedReviewCards,
  getMyReviewMediaTypeCodes,
  getMyReviewStatusCounts,
  getMyReviewsCatalog,
  getPublishedReviewCatalogAuthors,
  getPublishedReviewMediaTypeCodes,
  getPublishedReviewsCatalog,
} from "@/db/queries/contribution-reviews"
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types"
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header"
import { parsePage, parsePageSize } from "@/lib/common/pagination"

import { FeaturedReviews } from "./featured-reviews"
import { MyReviewCatalogRow } from "./my-review-catalog-row"
import { MyReviewsCatalogControls } from "./my-reviews-catalog-controls"
import { ReviewCatalogRow } from "./review-catalog-row"
import { ReviewsCatalogControls } from "./reviews-catalog-controls"
import {
  DEFAULT_REVIEW_CATALOG_PAGE_SIZE,
  parseMyReviewStatusFilter,
  parseReviewCatalogAuthorId,
  parseReviewCatalogMediaType,
  parseReviewCatalogPreset,
  parseReviewCatalogScoreFilter,
  parseReviewCatalogView,
  REVIEW_CATALOG_PAGE_SIZE_OPTIONS,
  type MyReviewStatusFilter,
} from "./reviews-catalog-logic"
import { ReviewsViewToggle } from "./reviews-view-toggle"

export const metadata: Metadata = {
  title: "Рецензии",
  description: "Мнения авторов о фильмах, играх, книгах и прочем.",
}

export const dynamic = "force-dynamic"

const FEATURED_REVIEWS_FETCH_LIMIT = 12

type ReviewsPageProps = {
  searchParams: Promise<{
    author?: string
    page?: string
    pageSize?: string
    preset?: string
    published?: string
    q?: string
    saved?: string
    score?: string
    status?: string
    submitted?: string
    type?: string
    view?: string
  }>
}

function formatReviewsFound(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count)
  const label =
    plural === "one" ? "рецензия" : plural === "few" ? "рецензии" : "рецензий"

  return `Найдено ${count} ${label}`
}

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const [params, headerState] = await Promise.all([
    searchParams,
    getPublicSiteHeaderState(),
  ])
  const currentAuthor = headerState.author
  const requestedView = parseReviewCatalogView(params.view)
  const view = currentAuthor && requestedView === "mine" ? "mine" : "all"
  const mediaTypes = await getEffectiveMediaTypeOptions(currentAuthor?.id)
  const enabledMediaTypes = mediaTypes.filter((mediaType) => mediaType.isEnabled)
  const enabledMediaTypeCodes = enabledMediaTypes.map((mediaType) => mediaType.code)
  const pageSize = parsePageSize(
    params.pageSize,
    REVIEW_CATALOG_PAGE_SIZE_OPTIONS,
    DEFAULT_REVIEW_CATALOG_PAGE_SIZE,
  )

  if (view === "mine" && currentAuthor) {
    const status = parseMyReviewStatusFilter(params.status)
    const [statusCountsRaw, presentMediaTypeCodes] = await Promise.all([
      getMyReviewStatusCounts(currentAuthor.id, enabledMediaTypeCodes),
      getMyReviewMediaTypeCodes(currentAuthor.id, enabledMediaTypeCodes),
    ])
    const presentMediaTypeSet = new Set(presentMediaTypeCodes)
    const availableMediaTypes = enabledMediaTypes.filter((item) =>
      presentMediaTypeSet.has(item.code),
    )
    const mediaType =
      availableMediaTypes.length >= 2
        ? parseReviewCatalogMediaType(
            params.type,
            availableMediaTypes.map((item) => item.code),
          )
        : "all"
    const catalog = await getMyReviewsCatalog({
      authorId: currentAuthor.id,
      enabledMediaTypeCodes,
      mediaType,
      page: parsePage(params.page),
      pageSize,
      status,
    })
    const statusCounts: Record<MyReviewStatusFilter, number> = {
      all: statusCountsRaw.all,
      published: statusCountsRaw.published,
      draft: statusCountsRaw.draft,
      submitted: statusCountsRaw.submitted,
    }
    const paginationSearchParams = {
      pageSize: pageSize !== DEFAULT_REVIEW_CATALOG_PAGE_SIZE ? String(pageSize) : undefined,
      status: status !== "all" ? status : undefined,
      type: mediaType !== "all" ? mediaType : undefined,
      view: "mine",
    }
    const hasActiveFilters = status !== "all" || mediaType !== "all"
    const toast: ArchiveToast | null =
      params.saved === "1"
        ? { id: "saved", tone: "success", text: "Черновик рецензии сохранен." }
        : params.published === "1"
          ? { id: "published", tone: "success", text: "Рецензия опубликована." }
          : params.submitted === "1"
            ? {
                id: "submitted",
                tone: "success",
                text: "Рецензия отправлена на проверку.",
              }
            : null

    return (
      <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
          <PublicSiteHeader {...headerState.headerProps} />
          <div className="mx-auto w-full max-w-[1280px]">
            <div className="archive-paper archive-panel archive-stack archive-stack-left overflow-hidden">
              <header className="relative z-20 p-5 pb-3 sm:p-6 sm:pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
                      Рецензии
                    </h1>
                    <p className="mt-2 text-sm text-stone-600">
                      Ваши рецензии на фильмы, игры, книги и прочее.
                    </p>
                  </div>
                  <ReviewsViewToggle view="mine" />
                </div>

                <div className="mt-4">
                  <Link
                    href="/reviews/new"
                    className={buttonVariants({ variant: "default", size: "sm" })}
                  >
                    + Написать рецензию
                  </Link>
                </div>

                <Suspense fallback={null}>
                  <ArchiveToasts
                    clearParams={["saved", "published", "submitted"]}
                    messages={toast ? [toast] : []}
                  />
                </Suspense>

                <Suspense fallback={null}>
                  <MyReviewsCatalogControls
                    mediaType={mediaType}
                    mediaTypes={availableMediaTypes}
                    status={status}
                    statusCounts={statusCounts}
                  />
                </Suspense>
              </header>

              <section aria-labelledby="my-reviews-title" className="px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2
                    id="my-reviews-title"
                    className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
                  >
                    Мои рецензии
                  </h2>
                  <p className="text-sm text-stone-600">{formatReviewsFound(catalog.totalCount)}</p>
                </div>

                {catalog.items.length === 0 ? (
                  <p className="mt-6 text-sm text-stone-600">
                    {hasActiveFilters
                      ? "По вашему запросу рецензии не найдены."
                      : "Рецензий пока нет. Напишите первую."}
                  </p>
                ) : (
                  <div className="mt-2">
                    {catalog.items.map((item) => (
                      <MyReviewCatalogRow
                        key={item.id}
                        item={item}
                        mediaTypes={mediaTypes}
                      />
                    ))}
                  </div>
                )}
              </section>

              <div className="border-t border-stone-400/45 bg-amber-50/20 px-3 py-3 [&>nav]:border-0 [&>nav]:bg-transparent [&>nav]:p-0 [&>nav]:shadow-none sm:px-4">
                <PaginationNav
                  basePath="/reviews"
                  itemLabel="рецензий"
                  page={catalog.page}
                  pageSize={catalog.pageSize}
                  pageSizeOptions={REVIEW_CATALOG_PAGE_SIZE_OPTIONS}
                  searchParams={paginationSearchParams}
                  showPageJump
                  totalCount={catalog.totalCount}
                  totalPages={catalog.totalPages}
                  variant="archive"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const searchQuery = params.q?.trim() ?? ""
  const preset = parseReviewCatalogPreset(params.preset)
  const scoreFilter = parseReviewCatalogScoreFilter(params.score)
  const authorId = parseReviewCatalogAuthorId(params.author)
  const presentMediaTypeCodes = await getPublishedReviewMediaTypeCodes(enabledMediaTypeCodes)
  const presentMediaTypeSet = new Set(presentMediaTypeCodes)
  const availableMediaTypes = enabledMediaTypes.filter((item) =>
    presentMediaTypeSet.has(item.code),
  )
  const mediaType =
    availableMediaTypes.length >= 2
      ? parseReviewCatalogMediaType(
          params.type,
          availableMediaTypes.map((item) => item.code),
        )
      : "all"

  const [featuredReviews, catalogAuthors, catalog] = await Promise.all([
    getLatestPublishedReviewCards(enabledMediaTypeCodes, FEATURED_REVIEWS_FETCH_LIMIT),
    getPublishedReviewCatalogAuthors(enabledMediaTypeCodes),
    getPublishedReviewsCatalog({
      authorId,
      enabledMediaTypeCodes,
      mediaType,
      page: parsePage(params.page),
      pageSize,
      preset,
      scoreFilter,
      searchQuery,
    }),
  ])

  const paginationSearchParams = {
    author: authorId ? String(authorId) : undefined,
    pageSize: pageSize !== DEFAULT_REVIEW_CATALOG_PAGE_SIZE ? String(pageSize) : undefined,
    preset: preset !== "all" ? preset : undefined,
    q: searchQuery || undefined,
    score: scoreFilter !== "all" ? scoreFilter : undefined,
    type: mediaType !== "all" ? mediaType : undefined,
  }

  const hasActiveFilters =
    Boolean(searchQuery) ||
    mediaType !== "all" ||
    scoreFilter !== "all" ||
    authorId !== null ||
    preset !== "all"

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="archive-paper archive-panel archive-stack archive-stack-left overflow-hidden">
            <header className="relative z-20 p-5 pb-3 sm:p-6 sm:pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
                    Рецензии
                  </h1>
                  <p className="mt-2 text-sm text-stone-600">
                    Мнения авторов о фильмах, играх, книгах и прочем.
                  </p>
                </div>
                {currentAuthor ? <ReviewsViewToggle view="all" /> : null}
              </div>

              <Suspense fallback={null}>
                <ReviewsCatalogControls
                  authors={catalogAuthors}
                  authorId={authorId}
                  currentAuthorId={currentAuthor?.id ?? null}
                  mediaType={mediaType}
                  mediaTypes={availableMediaTypes}
                  preset={preset}
                  scoreFilter={scoreFilter}
                  searchQuery={searchQuery}
                />
              </Suspense>
            </header>

            <FeaturedReviews reviews={featuredReviews} />

            <section aria-labelledby="all-reviews-title" className="px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2
                  id="all-reviews-title"
                  className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
                >
                  Все рецензии
                </h2>
                <p className="text-sm text-stone-600">{formatReviewsFound(catalog.totalCount)}</p>
              </div>

              {catalog.items.length === 0 ? (
                <p className="mt-6 text-sm text-stone-600">
                  {hasActiveFilters
                    ? "По вашему запросу рецензии не найдены."
                    : "Опубликованных рецензий пока нет."}
                </p>
              ) : (
                <div className="mt-2">
                  {catalog.items.map((item) => (
                    <ReviewCatalogRow key={item.id} item={item} mediaTypes={mediaTypes} />
                  ))}
                </div>
              )}
            </section>

            <div className="border-t border-stone-400/45 bg-amber-50/20 px-3 py-3 [&>nav]:border-0 [&>nav]:bg-transparent [&>nav]:p-0 [&>nav]:shadow-none sm:px-4">
              <PaginationNav
                basePath="/reviews"
                itemLabel="рецензий"
                page={catalog.page}
                pageSize={catalog.pageSize}
                pageSizeOptions={REVIEW_CATALOG_PAGE_SIZE_OPTIONS}
                searchParams={paginationSearchParams}
                showPageJump
                totalCount={catalog.totalCount}
                totalPages={catalog.totalPages}
                variant="archive"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
