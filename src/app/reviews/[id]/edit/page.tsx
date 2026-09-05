import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PublicSiteHeader } from "@/components/archive/public-site-header"
import { Alert } from "@/components/ui/alert"
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { getAuthorReviewForEdit } from "@/db/queries/contribution-reviews"
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types"
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header"
import { requireAuthor } from "@/lib/auth/author-auth"
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  isAuthorEditableContributionStatus,
} from "@/lib/contributions/model"
import { getReviewFormErrorMessage } from "@/lib/forms/contribution-review"

import { PublicReviewForm } from "../../review-form"

export const metadata: Metadata = {
  title: "Редактирование рецензии",
  description: "Измените свою рецензию.",
}

export const dynamic = "force-dynamic"

type EditReviewPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    error?: string
  }>
}

export default async function EditReviewPage({
  params,
  searchParams,
}: EditReviewPageProps) {
  const [{ id }, author, query, headerState] = await Promise.all([
    params,
    requireAuthor(),
    searchParams,
    getPublicSiteHeaderState(),
  ])
  const contributionId = Number(id)

  if (!Number.isInteger(contributionId) || contributionId <= 0) {
    notFound()
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id)
  const review = await getAuthorReviewForEdit(
    author.id,
    contributionId,
    accessibleMediaTypeCodes,
  )

  if (!review) {
    notFound()
  }

  const errorMessage = getReviewFormErrorMessage(query.error)
  const toastMessages: ArchiveToast[] = errorMessage
    ? [{ id: query.error ?? "review-error", tone: "error", text: errorMessage }]
    : []
  const isEditable = isAuthorEditableContributionStatus(review.status)

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="mx-auto w-full max-w-[720px]">
          <div className="archive-paper archive-panel archive-stack archive-stack-left overflow-hidden p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-serif text-3xl leading-none text-stone-950 sm:text-4xl">
                  Рецензия
                </h1>
                <p className="mt-2 text-sm text-stone-600">
                  {author.canPublishMediaWithoutReview
                    ? "Изменения можно сразу опубликовать в архиве."
                    : "После отправки текст попадет на проверку."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/reviews?view=mine"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Назад к рецензиям
                </Link>
                <Badge>{CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}</Badge>
              </div>
            </div>

            <Suspense fallback={null}>
              <ArchiveToasts clearParams={["error"]} messages={toastMessages} />
            </Suspense>

            {review.adminNote ? (
              <div className="mt-4">
                <Alert>{review.adminNote}</Alert>
              </div>
            ) : null}

            <div className="mt-5">
              {isEditable ? (
                <PublicReviewForm
                  canPublishWithoutReview={author.canPublishMediaWithoutReview}
                  contributionId={review.id}
                  mediaItem={{ id: review.mediaItemId, title: review.mediaItemTitle }}
                  mediaItemLocked
                  status={review.status}
                  values={{ title: review.title, body: review.body }}
                />
              ) : (
                <Alert>
                  {author.canPublishMediaWithoutReview
                    ? "Рецензия сейчас недоступна для редактирования."
                    : "Рецензия уже на проверке. Редактирование откроется после решения админа."}
                </Alert>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
