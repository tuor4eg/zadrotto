"use client"

import { CatalogHeaderControls } from "@/app/catalog-header-controls"
import type {
  AuthorRatingFilter,
  CatalogSort,
  CatalogSortDirection,
  CatalogYearFilter,
  CatalogYearMode,
  MediaTypeFilter,
} from "@/app/media-items-catalog-logic"
import { useDemoProfile } from "@/lib/user-state/use-demo-profile"

export function CatalogHeaderControlsWithDemo(props: {
  authorRatingFilter: AuthorRatingFilter
  currentAuthor: boolean
  mediaTypeFilter: MediaTypeFilter
  minReleaseYear: number | null
  ratedByAuthor: boolean
  searchQuery: string
  sort: CatalogSort
  sortDirection: CatalogSortDirection
  yearFilter: CatalogYearFilter
  yearMode: CatalogYearMode
}) {
  const demoProfile = useDemoProfile()
  const personalArchive = !props.ratedByAuthor && (
    props.currentAuthor || Boolean(demoProfile && demoProfile.import.importedAt == null)
  )

  return (
    <CatalogHeaderControls
      {...props}
      currentAuthor={personalArchive}
      ratingSubject={personalArchive || props.ratedByAuthor}
    />
  )
}
