import { getSubmittedContributionReviewCountForAdmin } from "@/db/queries/contribution-reviews"
import { getSubmittedFranchisesCountForAdmin } from "@/db/queries/franchises"
import { getSubmittedAuthorMediaItemsCountForAdmin } from "@/db/queries/media-items"

export async function getSubmittedModerationRequestCountForAdmin() {
  const [mediaItemsCount, franchisesCount, reviewsCount] = await Promise.all([
    getSubmittedAuthorMediaItemsCountForAdmin(),
    getSubmittedFranchisesCountForAdmin(),
    getSubmittedContributionReviewCountForAdmin(),
  ])

  return mediaItemsCount + franchisesCount + reviewsCount
}
