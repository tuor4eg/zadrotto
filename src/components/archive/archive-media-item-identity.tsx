import { Fragment } from "react"
import Link from "next/link"

import { MediaCarrierDisplayTitle } from "@/app/media-carrier-display-title"
import { MediaItemFranchiseLinks } from "@/components/archive/media-item-franchise-links"
import type { MediaItemFranchiseLink } from "@/db/queries/media-items"
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame"
import { getArchiveMediaItemInfoLabels } from "@/lib/media/media-item-summary"
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types"

type ArchiveMediaItemIdentityProps = {
  franchiseActions?: React.ReactNode
  item: {
    aliases?: string[]
    code: string
    franchises: MediaItemFranchiseLink[]
    mediaCarrierCode?: string | null
    mediaType: MediaType
    metadataFacts?: Record<string, unknown> | null
    originalTitle: string | null
    releaseYear: number | null
    title: string
  }
  mediaTypes: MediaTypeOption[]
  showFranchiseSection?: boolean
}

export function ArchiveMediaItemIdentity({
  franchiseActions,
  item,
  mediaTypes,
  showFranchiseSection = false,
}: ArchiveMediaItemIdentityProps) {
  const mediaCarrierFrame = getMediaCarrierFrame(item)
  const displayFontClassName = mediaCarrierFrame?.displayFontClassName ?? "font-serif"
  const labelFontClassName = mediaCarrierFrame?.labelFontClassName ?? "font-mono"
  const mediaTypeLabel = getMediaTypeLabel(item.mediaType, mediaTypes)
  const infoLabels = getArchiveMediaItemInfoLabels({
    mediaType: item.mediaType,
    mediaTypeLabel,
    metadataFacts: item.metadataFacts,
    releaseYear: item.releaseYear,
  })

  return (
    <header className="relative">
      <nav aria-label="Хлебные крошки" className={`${labelFontClassName} min-w-0 pr-16 text-xs leading-5 text-stone-600 sm:pr-24`}>
        <ol className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
          <li>
            <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/archive?type=${encodeURIComponent(item.mediaType)}`}>
              {mediaTypeLabel}
            </Link>
          </li>
          <li aria-hidden="true" className="text-stone-400">/</li>
          <li>
            <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/media/${item.code}`}>
              {item.title}
            </Link>
          </li>
          <li aria-hidden="true" className="text-stone-400">/</li>
          <li aria-current="page" className="min-w-0 truncate text-stone-800">Рецензии</li>
        </ol>
      </nav>

      <div className="mt-3 max-w-[980px] pr-16 sm:pr-24">
        <Link
          href={`/media/${item.code}`}
          className={mediaCarrierFrame
            ? `${displayFontClassName} text-xl leading-[1.5] text-stone-950 hover:text-stone-700 sm:text-3xl`
            : "font-serif text-3xl leading-none text-stone-950 hover:text-stone-700 sm:text-5xl"}
        >
          <MediaCarrierDisplayTitle title={item.title} frame={mediaCarrierFrame} />
        </Link>
        {item.originalTitle && item.originalTitle !== item.title ? (
          <div className={`mt-3 ${labelFontClassName} text-xs uppercase leading-6 text-stone-700`}>
            {item.originalTitle}
          </div>
        ) : null}
        {(item.aliases?.length ?? 0) > 0 ? (
          <div className={`mt-2 ${labelFontClassName} text-xs leading-5 text-stone-600`}>
            Также известно как: {item.aliases?.join(", ")}
          </div>
        ) : null}
      </div>

      <div className={`${labelFontClassName} mt-4 text-xs leading-6 text-stone-800`}>
        {infoLabels.map((label, index) => (
          <Fragment key={`${label}-${index}`}>
            {index > 0 ? <span className="mx-1.5">•</span> : null}
            <span>{label}</span>
          </Fragment>
        ))}
      </div>

      {(item.franchises.length > 0 || showFranchiseSection) ? (
        <dl className="mt-7 text-sm leading-6 text-stone-800">
          <div>
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase leading-6 text-stone-600">
              <span className={labelFontClassName}>Серия</span>
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
      ) : null}
    </header>
  )
}
