import { MediaItemPlatformLinks } from "@/components/archive/media-item-platform-links";
import { RobloxCreatorDetails } from "@/components/archive/roblox-creator-details";
import type { MediaItemPlatform } from "@/lib/media/platforms";
import { MediaItemWriterLinks, type WriterCreatorLink } from "@/components/archive/media-item-creator-links";
import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";
import { Fragment } from "react"
import Link from "next/link"

import { MediaCarrierDisplayTitle } from "@/app/media-carrier-display-title"
import { ArchiveMediaItemIdentityLayout } from "@/components/archive/archive-media-item-identity-layout"
import { RateableMediaItemTile, TileRatingScope } from "@/components/archive/tile-rating-scope"
import { MediaItemFranchiseLinks } from "@/components/archive/media-item-franchise-links"
import { MediaItemGenreLinks } from "@/components/archive/media-item-genre-links"
import type { MediaItemFranchiseLink } from "@/db/queries/media-items"
import { getMediaCarrierFrame, MEDIA_IDENTITY_FONT_CLASS_NAME } from "@/lib/media/carrier-frame"
import { getArchiveMediaItemInfoLabels } from "@/lib/media/media-item-summary"
import type { MediaItemGenre } from "@/lib/media/genres"
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types"

type ArchiveMediaItemIdentityProps = {
  ratingPartId?: number | null
  franchiseActions?: React.ReactNode
  item: {
    id: number
    averageScore: number | null
    ratingsCount: number
    currentAuthorScore: number | null
    aliases?: string[]
    code: string
    coverThumbUrl?: string | null
    coverUrl?: string | null
    franchises: MediaItemFranchiseLink[]
    mediaCarrierCode?: string | null
    mediaType: MediaType
    metadataFacts?: Record<string, unknown> | null
    genres: MediaItemGenre[]
    platforms?: MediaItemPlatform[]
    writerCreators?: WriterCreatorLink[]
    entryCreators?: { id?: number; name: string; slug?: string; roleCode: string }[]
    originalTitle: string | null
    releaseYear: number | null
    title: string
  }
  mediaTypes: MediaTypeOption[]
  showFranchiseSection?: boolean
}

export function ArchiveMediaItemIdentity({
  ratingPartId,
  franchiseActions,
  item,
  mediaTypes,
  showFranchiseSection = false,
}: ArchiveMediaItemIdentityProps) {
  const { displayTitle, displayOriginalTitle, displayAliases } = resolveMediaItemDisplayTitles(item)
  const mediaCarrierFrame = getMediaCarrierFrame(item)
  const carrierLabelFontClassName = mediaCarrierFrame?.labelFontClassName ?? "font-mono"
  const mediaTypeLabel = getMediaTypeLabel(item.mediaType, mediaTypes)
  const infoLabels = getArchiveMediaItemInfoLabels({
    mediaType: item.mediaType,
    mediaTypeLabel,
    metadataFacts: item.metadataFacts,
    genres: [],
    releaseYear: item.releaseYear,
  })

  return (
    <ArchiveMediaItemIdentityLayout
      cover={
        <TileRatingScope>
          <RateableMediaItemTile
            item={{ ...item, coverUrl: item.coverUrl ?? null }}
            href={`/media/${item.code}`}
            currentAuthorScore={item.currentAuthorScore}
            partId={ratingPartId}
            showTitle={false}
            hoverEffect={false}
          />
        </TileRatingScope>
      }
      breadcrumb={
        <nav aria-label="Хлебные крошки" className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} min-w-0 pr-16 text-xs leading-5 text-stone-600 sm:pr-24`}>
        <ol className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
          <li>
            <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/archive?type=${encodeURIComponent(item.mediaType)}`}>
              {mediaTypeLabel}
            </Link>
          </li>
          <li aria-hidden="true" className="text-stone-400">/</li>
          <li>
            <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/media/${item.code}`}>
              {displayTitle}
            </Link>
          </li>
          <li aria-hidden="true" className="text-stone-400">/</li>
          <li aria-current="page" className="min-w-0 truncate text-stone-800">Рецензии</li>
        </ol>
      </nav>
      }
      footer={
        (item.franchises.length > 0 || showFranchiseSection) ? (
        <dl className="text-sm sm:mt-7 leading-6 text-stone-800">
          <div>
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase leading-6 text-stone-600">
              <span className={MEDIA_IDENTITY_FONT_CLASS_NAME}>Серия</span>
              {item.franchises.length === 0 ? franchiseActions : null}
            </dt>
            <dd className="mt-1">
              <MediaItemFranchiseLinks
                franchises={item.franchises}
                containerClassName="flex flex-wrap gap-1.5"
                className="rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-5 text-stone-100 transition-colors hover:bg-[var(--archive-bg-start)] hover:text-white"
                trailingAction={item.franchises.length > 0 ? franchiseActions : null}
              />
            </dd>
          </div>
        </dl>
      ) : null
      }
    >

      <div className="max-w-[980px] sm:mt-3 sm:pr-24">
        <Link
          href={`/media/${item.code}`}
          className={mediaCarrierFrame
            ? `${MEDIA_IDENTITY_FONT_CLASS_NAME} text-xl leading-[1.5] text-stone-950 hover:text-stone-700 sm:text-3xl`
            : `${MEDIA_IDENTITY_FONT_CLASS_NAME} text-3xl leading-none text-stone-950 hover:text-stone-700 sm:text-5xl`}
        >
          <MediaCarrierDisplayTitle title={displayTitle} frame={mediaCarrierFrame} />
        </Link>
        {displayOriginalTitle ? (
          <div className={`mt-3 ${carrierLabelFontClassName} text-xs uppercase leading-6 text-stone-700`}>
            {displayOriginalTitle}
          </div>
        ) : null}
        {displayAliases.length > 0 ? (
          <div className={`mt-2 ${carrierLabelFontClassName} text-xs leading-5 text-stone-600`}>
            Также известно как: {displayAliases.join(", ")}
          </div>
        ) : null}
      </div>

      <div className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} mt-4 text-xs leading-6 text-stone-800`}>
        {infoLabels.map((label, index) => (
          <Fragment key={`${label}-${index}`}>
            {index > 0 ? <span className="mx-1.5">•</span> : null}
            {index === 0 && item.releaseYear ? (
              <Link className="underline underline-offset-4 hover:text-stone-950" href={`/archive?year=${item.releaseYear}&yearMode=release`}>
                {label}
              </Link>
            ) : <span>{label}</span>}
          </Fragment>
        ))}
        {item.mediaType === "book" && item.writerCreators?.length ? <>
          {infoLabels.length > 0 ? <span className="mx-1.5">•</span> : null}
          <MediaItemWriterLinks creators={item.writerCreators} />
        </> : null}
        {item.mediaType === "game" && item.platforms?.length ? <><span className="mx-1.5">•</span><MediaItemPlatformLinks platforms={item.platforms} /></> : null}
        {item.mediaType === "roblox" ? <RobloxCreatorDetails creators={item.entryCreators} facts={item.metadataFacts} separatorBefore={infoLabels.length > 0} /> : null}
        {item.genres.length > 0 ? <>
          {infoLabels.length > 0 ? <span className="mx-1.5">•</span> : null}
          <MediaItemGenreLinks genres={item.genres} />
        </> : null}
      </div>

    </ArchiveMediaItemIdentityLayout>
  )
}
