import { getSubmittedContributionReviewCountForAdmin } from "@/db/queries/contribution-reviews"
import { getSubmittedAuthorMediaItemsCountForAdmin } from "@/db/queries/media-items"
import { getOpenBugReportCount } from "@/db/queries/bug-reports"

export async function getSubmittedModerationRequestCountForAdmin() {
  const [mediaItemsCount, reviewsCount, bugReportsCount] = await Promise.all([
    getSubmittedAuthorMediaItemsCountForAdmin(),
    getSubmittedContributionReviewCountForAdmin(),
    getOpenBugReportCount(),
  ])

  return mediaItemsCount + reviewsCount + bugReportsCount
}
