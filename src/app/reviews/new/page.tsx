import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { PublicSiteHeader } from "@/components/archive/public-site-header"
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts"
import { buttonVariants } from "@/components/ui/button"
import {
  getAuthorReviewForMediaItem,
  getPublishedMediaItemForReview,
} from "@/db/queries/contribution-reviews"
import {
  getAccessibleMediaTypeCodes,
  getEffectiveMediaTypeOptions,
} from "@/db/queries/media-types"
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header"
import { requireAuthor } from "@/lib/auth/author-auth"
import { getReviewFormErrorMessage } from "@/lib/forms/contribution-review"

import { PublicReviewForm } from "../review-form"

export const metadata: Metadata = {
  title: "Новая рецензия",
  description: "Напишите рецензию на запись из архива.",
}

export const dynamic = "force-dynamic"

type NewReviewPageProps = {
  searchParams: Promise<{
    error?: string
    mediaItemId?: string
  }>
}

function parsePositiveInteger(value?: string) {
  const parsedValue = Number(value)

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null
}

export default async function NewReviewPage({ searchParams }: NewReviewPageProps) {
  const author = await requireAuthor()
  const [params, headerState, mediaTypes] = await Promise.all([
    searchParams,
    getPublicSiteHeaderState(),
    getEffectiveMediaTypeOptions(author.id),
  ])
  const mediaItemId = parsePositiveInteger(params.mediaItemId)
  const errorMessage = getReviewFormErrorMessage(params.error)
  const toastMessages: ArchiveToast[] = errorMessage
    ? [{ id: params.error ?? "review-error", tone: "error", text: errorMessage }]
    : []

  let initialMediaItem: { id: number; title: string } | null = null

  if (mediaItemId) {
    const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id)
    const [mediaItem, existingReview] = await Promise.all([
      getPublishedMediaItemForReview(mediaItemId, accessibleMediaTypeCodes),
      getAuthorReviewForMediaItem(author.id, mediaItemId),
    ])

    if (!mediaItem) {
      redirect("/reviews/new?error=not-found")
    }

    if (existingReview) {
      redirect(`/reviews/${existingReview.id}/edit`)
    }

    initialMediaItem = { id: mediaItem.id, title: mediaItem.title }
  }

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="mx-auto w-full max-w-[720px]">
          <div className="archive-paper archive-panel archive-stack archive-stack-left overflow-hidden p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-serif text-3xl leading-none text-stone-950 sm:text-4xl">
                  Новая рецензия
                </h1>
                <p className="mt-2 text-sm text-stone-600">
                  {author.canPublishMediaWithoutReview
                    ? "Рецензия сразу появится в архиве."
                    : "Рецензия станет публичной после проверки."}
                </p>
              </div>
              <Link
                href="/reviews?view=mine"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Назад к рецензиям
              </Link>
            </div>

            <Suspense fallback={null}>
              <ArchiveToasts clearParams={["error"]} messages={toastMessages} />
            </Suspense>

            <div className="mt-5">
              <PublicReviewForm
                canPublishWithoutReview={author.canPublishMediaWithoutReview}
                mediaItem={initialMediaItem}
                mediaItemLocked={false}
                mediaTypes={mediaTypes}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
