import type { AuthorRatingFilter } from "@/app/media-items-catalog-logic"
import type { DemoProfile } from "@/lib/user-state/demo-profile"

export function matchDemoAuthorRatingFilter(
  mediaItemCode: string,
  filter: AuthorRatingFilter,
  profile: DemoProfile,
) {
  const rated = Boolean(profile.ratings[mediaItemCode])
  const status = profile.statuses[mediaItemCode]?.status ?? null

  switch (filter) {
    case "all":
      return true
    case "rated":
      return rated
    case "wanted":
      return !rated && status === "wanted"
    case "skipped":
      return !rated && status === "skipped"
    case "unmarked":
      return !rated && status == null
    default:
      return true
  }
}

/** Account wins: import demo rating/status only into empty server slots. */
export function shouldImportDemoRating(hasServerRating: boolean) {
  return !hasServerRating
}

export function shouldImportDemoStatus(input: {
  hasServerRating: boolean
  hasServerStatus: boolean
  hasDemoRating: boolean
}) {
  if (input.hasDemoRating) return false
  if (input.hasServerRating || input.hasServerStatus) return false
  return true
}
