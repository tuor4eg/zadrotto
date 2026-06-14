import Link from "next/link";

import { ArchiveNote } from "@/app/archive-note";
import { MediaCarrierDisplayTitle } from "@/app/media-carrier-display-title";
import { ArchiveCover, MediaItemTile } from "@/app/media-item-tile";
import { ArchiveRatingPanel } from "@/app/media-rating-panel";
import { ArchiveBackLink } from "@/components/ui/archive-back-link";
import { ImageViewer } from "@/components/ui/image-viewer";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
import { AVERAGE_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone";

type MediaItemDetailsItem = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
  mediaType: MediaType;
  franchiseCode?: string | null;
  franchiseTitle?: string | null;
  mediaCarrierCode?: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  coverSourceProvider?: string | null;
  coverSourcePageUrl?: string | null;
  averageScore: number | null;
  ratingsCount: number;
};

type RelatedMediaItem = {
  averageScore: number | null;
  id: number;
  code: string;
  title: string;
  mediaType: MediaType;
  mediaCarrierCode?: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  ratingsCount: number;
  currentAuthorScore: number | null;
};

type MediaItemDetailsProps = {
  item: MediaItemDetailsItem;
  backLink: {
    href: string;
    label: string;
  };
  variant?: "default" | "archive";
  actions?: React.ReactNode;
  adjacentShelfSlot?: React.ReactNode;
  meta?: React.ReactNode;
  mediaTypes: MediaTypeOption[];
  ratingSlot?: React.ReactNode;
  noteSlot?: React.ReactNode;
  relatedItems?: RelatedMediaItem[];
};

function CoverSourceAttribution({
  provider,
  pageUrl,
}: {
  provider?: string | null;
  pageUrl?: string | null;
}) {
  if (provider !== "rawg" || !pageUrl) {
    return null;
  }

  return (
    <Link
      href={pageUrl}
      className="mt-2 inline-flex w-fit text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-950"
    >
      Обложка: RAWG
    </Link>
  );
}

export function MediaItemDetails({
  item,
  backLink,
  variant = "default",
  actions,
  adjacentShelfSlot,
  meta,
  mediaTypes,
  ratingSlot,
  noteSlot,
  relatedItems = [],
}: MediaItemDetailsProps) {
  if (variant === "archive") {
    return (
      <ArchiveMediaItemDetails
        item={item}
        backLink={backLink}
        actions={actions}
        adjacentShelfSlot={adjacentShelfSlot}
        meta={meta}
        mediaTypes={mediaTypes}
        ratingSlot={ratingSlot}
        noteSlot={noteSlot}
        relatedItems={relatedItems}
      />
    );
  }

  const hasCarrierFrame = getMediaCarrierFrame(item) !== null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Link
          href={backLink.href}
          className="w-fit border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
        >
          {backLink.label}
        </Link>
        {actions}
      </div>

      <article className="border border-zinc-300 bg-white">
        <div className="grid gap-0 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="aspect-[4/3] bg-zinc-200 md:aspect-auto md:min-h-[480px]">
            {item.coverUrl ? (
              <ImageViewer
                src={item.coverUrl}
                alt={`Обложка: ${item.title}`}
                title={item.title}
                triggerClassName={`block h-full w-full cursor-zoom-in text-left ${
                  hasCarrierFrame ? "" : "media-image-lift-trigger"
                }`}
              >
                <ArchiveCover item={item} className="h-full w-full" />
              </ImageViewer>
            ) : (
              <ArchiveCover item={item} className="h-full w-full" />
            )}
            <CoverSourceAttribution
              provider={item.coverSourceProvider}
              pageUrl={item.coverSourcePageUrl}
            />
          </div>

          <div className="flex min-h-[360px] flex-col justify-between gap-10 p-5 sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                <span>{getMediaTypeLabel(item.mediaType, mediaTypes)}</span>
                {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                {meta}
              </div>

              {item.franchiseTitle ? (
                item.franchiseCode ? (
                  <Link
                    href={`/franchises/${item.franchiseCode}`}
                    className="w-fit border border-zinc-200 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Серия: <span className="font-medium text-zinc-800">{item.franchiseTitle}</span>
                  </Link>
                ) : (
                  <div className="w-fit border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                    Серия: <span className="font-medium text-zinc-800">{item.franchiseTitle}</span>
                  </div>
                )
              ) : null}

              <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl">
                  {item.title}
                </h1>
                {item.originalTitle && item.originalTitle !== item.title ? (
                  <p className="text-lg text-zinc-500">{item.originalTitle}</p>
                ) : null}
                {item.description ? (
                  <p className="max-w-2xl text-base leading-7 text-zinc-600">
                    {item.description}
                  </p>
                ) : null}
              </div>

              <div
                className={`w-fit border px-3 py-2 ${AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(item.averageScore)]}`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                  Средний рейтинг
                </span>
                <span className="mt-1 block text-2xl font-semibold tabular-nums">
                  {formatScore(item.averageScore)}
                </span>
                <span className="mt-1 block text-xs opacity-70">
                  {formatRatingsCount(item.ratingsCount)}
                </span>
              </div>

              {ratingSlot}
              {noteSlot}
            </div>

            <div className="flex flex-col gap-4 pt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">
              <div className="flex flex-col gap-2 normal-case tracking-normal">
                {adjacentShelfSlot ?? (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                      На соседней полке
                    </div>
                    <div className="px-3 py-2 text-xs text-zinc-500">
                      Here be dragons
                    </div>
                  </>
                )}
              </div>

              {item.franchiseTitle ? (
                <div className="flex flex-col gap-2 normal-case tracking-normal">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                    Еще из этой серии
                  </div>
                  {relatedItems.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {relatedItems.map((relatedItem) => (
                        <Link
                          key={relatedItem.id}
                          href={`/media/${relatedItem.code}`}
                          className="border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                        >
                          {relatedItem.title}
                          {relatedItem.releaseYear ? `, ${relatedItem.releaseYear}` : ""}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-xs text-zinc-500">
                      Других тайтлов серии пока нет.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function ArchiveMediaItemDetails({
  item,
  backLink,
  actions,
  adjacentShelfSlot,
  meta,
  mediaTypes,
  ratingSlot,
  noteSlot,
  relatedItems,
}: Omit<MediaItemDetailsProps, "variant"> & { relatedItems: RelatedMediaItem[] }) {
  const mediaCarrierFrame = getMediaCarrierFrame(item);
  const hasCarrierFrame = mediaCarrierFrame !== null;
  const labelFontClassName = mediaCarrierFrame?.labelFontClassName ?? "font-mono";
  const displayFontClassName = mediaCarrierFrame?.displayFontClassName ?? "font-serif";

  return (
    <div className="flex flex-col gap-3">
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}

      <article className="archive-paper archive-panel archive-stack archive-stack-left relative z-10 min-w-0 overflow-visible">
        <ArchiveBackLink
          href={backLink.href}
          label={backLink.label}
          tooltipLabel="К картотеке"
        />

        <div className="relative z-10 grid lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/clip-transparent-trimmed.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 right-5 z-30 h-24 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:-top-3 sm:right-6 sm:h-28 lg:-top-4 lg:right-8 lg:h-32"
          />

          <div className="relative px-6 pb-6 pt-[3.75rem]">
            <div className={`${labelFontClassName} text-sm uppercase leading-7 text-stone-950`}>
              Досье
            </div>
            <div
              className={
                hasCarrierFrame
                  ? "mt-6 mx-auto max-w-[420px]"
                  : "mt-6 mx-auto max-w-[360px] rounded-md border border-stone-400 bg-stone-950 p-2 shadow-2xl shadow-stone-950/25"
              }
            >
              <div
                className={
                  hasCarrierFrame
                    ? ""
                    : "rounded-sm border border-stone-700 bg-stone-900 p-3"
                }
              >
                {!hasCarrierFrame ? (
                  <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-200">
                    Archive cover
                  </div>
                ) : null}
                <div
                  className={
                    hasCarrierFrame
                      ? `relative ${
                          mediaCarrierFrame.viewportClassName ?? mediaCarrierFrame.aspectRatioClassName
                        } overflow-visible rounded-sm`
                      : "relative aspect-[3/4] overflow-hidden rounded-sm bg-stone-800"
                  }
                >
                  {item.coverUrl ? (
                    <ImageViewer
                      src={item.coverUrl}
                      alt={`Обложка: ${item.title}`}
                      title={item.title}
                      triggerClassName={`block h-full w-full cursor-zoom-in text-left ${
                        hasCarrierFrame ? "" : "media-image-lift-trigger"
                      }`}
                    >
                      <ArchiveCover item={item} className="h-full w-full" />
                    </ImageViewer>
                  ) : (
                    <ArchiveCover item={item} className="h-full w-full" />
                  )}
                  {!item.coverUrl && !hasCarrierFrame ? (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
                      <span className="rounded-sm bg-stone-50/60 px-3 py-2 text-center font-mono text-xs font-semibold uppercase tracking-[0.18em] text-stone-900/75 shadow-[0_1px_0_rgba(255,255,255,0.45)]">
                        Нет изображения
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <CoverSourceAttribution
                provider={item.coverSourceProvider}
                pageUrl={item.coverSourcePageUrl}
              />
            </div>
          </div>

          <div className="flex min-h-[560px] flex-col justify-between gap-8 px-6 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-8">
            <div>
              <div className="max-w-[760px] pr-16 sm:pr-20 lg:pr-24">
                <div
                  className={
                    mediaCarrierFrame
                      ? `${displayFontClassName} text-2xl leading-[1.55] text-stone-950 sm:text-4xl`
                      : "font-serif text-4xl leading-none text-stone-950 sm:text-6xl"
                  }
                >
                  <MediaCarrierDisplayTitle title={item.title} frame={mediaCarrierFrame} />
                </div>
                {item.originalTitle && item.originalTitle !== item.title ? (
                  <div className={`mt-3 ${labelFontClassName} text-xs uppercase leading-6 text-stone-700`}>
                    {item.originalTitle}
                  </div>
                ) : null}
              </div>

              <div className={`mt-5 flex flex-wrap gap-3 ${labelFontClassName} text-xs leading-6 text-stone-800`}>
                <span>{getMediaTypeLabel(item.mediaType, mediaTypes).toLowerCase()}</span>
                {item.releaseYear ? <span>•</span> : null}
                {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                {meta ? <span>•</span> : null}
                {meta}
                <span>•</span>
                <span>{formatRatingsCount(item.ratingsCount)}</span>
              </div>

              <dl className="mt-8 grid gap-5 text-sm leading-6 text-stone-800">
                <div>
                  <dt className={`${labelFontClassName} text-xs font-semibold uppercase leading-6 text-stone-600`}>
                    Серия
                  </dt>
                  <dd className="mt-1">
                    {item.franchiseTitle && item.franchiseCode ? (
                      <Link
                        href={`/franchises/${item.franchiseCode}`}
                        className="font-medium text-stone-950 underline decoration-stone-400 underline-offset-4 transition-colors hover:decoration-stone-950"
                      >
                        {item.franchiseTitle}
                      </Link>
                    ) : item.franchiseTitle ? (
                      item.franchiseTitle
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <ArchiveRatingPanel
                  displayFontClassName={displayFontClassName}
                  label="Оценка архива"
                  labelFontClassName={labelFontClassName}
                  ratingPanelVariant={mediaCarrierFrame?.ratingPanelVariant}
                  ratingsCount={item.ratingsCount}
                  score={item.averageScore}
                />

                {ratingSlot ?? (
                  <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-4 text-center">
                    <div className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                      Оценок
                    </div>
                    <div className="mt-2 font-serif text-5xl tabular-nums text-stone-950">
                      {item.ratingsCount}
                    </div>
                    <div className="mt-2 font-mono text-xs text-stone-500">
                      {formatRatingsCount(item.ratingsCount)}
                    </div>
                  </div>
                )}

                <div className="mt-6 sm:col-span-2">
                  <ArchiveNote text={item.description} maxWidthClassName="max-w-none" />
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {noteSlot}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8 lg:col-span-2">
            <section>
              {adjacentShelfSlot ?? (
                <>
                  <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    На соседней полке
                  </div>
                  <div className="mt-4 px-4 py-5 font-mono text-sm text-stone-500">
                    Here be dragons
                  </div>
                </>
              )}
            </section>

            {item.franchiseTitle ? (
              <section>
                <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Еще из этой серии
                </div>
                {relatedItems.length > 0 ? (
                  <div className="mt-4 grid grid-cols-3 content-start gap-2.5 md:grid-cols-4 xl:grid-cols-6">
                    {relatedItems.map((relatedItem) => (
                      <MediaItemTile
                        key={relatedItem.id}
                        currentAuthorScore={relatedItem.currentAuthorScore}
                        item={relatedItem}
                        href={`/media/${relatedItem.code}`}
                        mediaTypes={mediaTypes}
                        showMediaTypeLabel
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 px-4 py-5 font-mono text-sm text-stone-500">
                    Других тайтлов серии пока нет.
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </article>
    </div>
  );
}
