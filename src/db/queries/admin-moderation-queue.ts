import { getSubmittedContributionReviewCountForAdmin } from "@/db/queries/contribution-reviews"
import { getSubmittedFranchisesCountForAdmin } from "@/db/queries/franchises"
import { getSubmittedAuthorMediaItemsCountForAdmin } from "@/db/queries/media-items"
import { getOpenBugReportCount } from "@/db/queries/bug-reports"

export async function getSubmittedModerationRequestCountForAdmin() {
  const [mediaItemsCount, franchisesCount, reviewsCount, bugReportsCount] = await Promise.all([
    getSubmittedAuthorMediaItemsCountForAdmin(),
    getSubmittedFranchisesCountForAdmin(),
    getSubmittedContributionReviewCountForAdmin(),
    getOpenBugReportCount(),
  ])

  return mediaItemsCount + franchisesCount + reviewsCount + bugReportsCount
}
