import Link from "next/link";

import { ArchiveNote } from "@/app/archive-note";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";
import { AVERAGE_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/rating-tone";

type MediaItemDetailsItem = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
  mediaType: MediaType;
  franchiseCode?: string | null;
  franchiseTitle?: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  averageScore: number | null;
  ratingsCount: number;
};

type RelatedMediaItem = {
  id: number;
  code: string;
  title: string;
  releaseYear: number | null;
  coverUrl: string | null;
};

type MediaItemDetailsProps = {
  item: MediaItemDetailsItem;
  backLink: {
    href: string;
    label: string;
  };
  variant?: "default" | "archive";
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  ratingSlot?: React.ReactNode;
  noteSlot?: React.ReactNode;
  relatedItems?: RelatedMediaItem[];
};

export function MediaItemDetails({
  item,
  backLink,
  variant = "default",
  actions,
  meta,
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
        meta={meta}
        ratingSlot={ratingSlot}
        noteSlot={noteSlot}
        relatedItems={relatedItems}
      />
    );
  }

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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.coverUrl}
                alt={`Обложка: ${item.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#e4e4e7,#fafafa)] px-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Без обложки
              </div>
            )}
          </div>

          <div className="flex min-h-[360px] flex-col justify-between gap-10 p-5 sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                <span>{MEDIA_TYPE_LABELS[item.mediaType]}</span>
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

            {relatedItems.length > 0 ? (
              <div className="border-t border-zinc-200 pt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">
                <div className="flex flex-col gap-2 normal-case tracking-normal">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                    Еще из этой серии
                  </div>
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
                </div>
              </div>
            ) : null}
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
  meta,
  ratingSlot,
  noteSlot,
  relatedItems,
}: Omit<MediaItemDetailsProps, "variant"> & { relatedItems: RelatedMediaItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}

      <article className="archive-paper archive-panel archive-stack archive-stack-left relative min-w-0 overflow-visible">
        <ArchiveTooltip
          label="Назад"
          className="absolute left-0 top-7 z-40 h-20 w-16 -translate-x-full"
          side="top"
        >
          <Link
            href={backLink.href}
            className="grid h-full w-full place-items-center bg-stone-200/70 text-stone-800 shadow-[0_10px_18px_rgba(28,25,23,0.16)] [clip-path:polygon(0_50%,100%_0,100%_100%)] hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
            aria-label={backLink.label}
          >
            <span
              className="translate-x-3 font-mono text-4xl leading-none transition-transform group-hover:translate-x-2"
              aria-hidden="true"
            >
              &lt;
            </span>
          </Link>
        </ArchiveTooltip>

        <div className="relative grid lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/clip-transparent-trimmed.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute top-2 right-5 z-30 h-24 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:top-0 sm:right-6 sm:h-28 lg:-top-4 lg:right-8 lg:h-32"
          />

          <div className="relative border-b border-stone-300/80 bg-stone-200/30 p-6 lg:border-b-0 lg:border-r">
            <div className="font-mono text-lg uppercase tracking-[0.38em] text-stone-950">
              Досье
            </div>
            <div className="mt-6 mx-auto max-w-[360px] rounded-md border border-stone-400 bg-stone-950 p-2 shadow-2xl shadow-stone-950/25">
              <div className="rounded-sm border border-stone-700 bg-stone-900 p-3">
                <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-200">
                  Archive cover
                </div>
                <div className="aspect-[3/4] overflow-hidden rounded-sm bg-stone-800">
                  {item.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverUrl}
                      alt={`Обложка: ${item.title}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#d8cbb4,#f7efdf_52%,#c8b58f)] px-6 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Без обложки
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-[560px] flex-col justify-between gap-8 p-6 sm:p-8">
            <div>
              <div className="max-w-[760px] pr-16 sm:pr-20 lg:pr-24">
                <div className="font-serif text-4xl leading-none text-stone-950 sm:text-6xl">
                  {item.title}
                </div>
                {item.originalTitle && item.originalTitle !== item.title ? (
                  <div className="mt-3 font-mono text-sm uppercase tracking-[0.16em] text-stone-600">
                    {item.originalTitle}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-3 font-mono text-sm text-stone-800">
                <span>{MEDIA_TYPE_LABELS[item.mediaType].toLowerCase()}</span>
                {item.releaseYear ? <span>•</span> : null}
                {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                {meta ? <span>•</span> : null}
                {meta}
                <span>•</span>
                <span>{formatRatingsCount(item.ratingsCount)}</span>
              </div>

              <dl className="mt-8 grid gap-5 border-t border-dashed border-stone-300 pt-5 text-sm leading-6 text-stone-800">
                <div>
                  <dt className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
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
                <div
                  className={`rounded-md border p-4 text-center ${AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(item.averageScore)]}`}
                >
                  <div className="font-mono text-xs uppercase tracking-[0.14em] opacity-70">
                    Оценка архива
                  </div>
                  <div className="mt-2 font-serif text-5xl tabular-nums">
                    {formatScore(item.averageScore)}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <DetailRatingStars score={item.averageScore} />
                  </div>
                </div>

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

                {item.description ? (
                  <div className="mt-3 sm:col-span-2">
                    <ArchiveNote text={item.description} maxWidthClassName="max-w-none" />
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {noteSlot}
              </div>
            </div>
          </div>
        </div>

        {relatedItems.length > 0 ? (
          <div className="border-t border-stone-300/80 bg-stone-50/20 p-6 sm:p-8">
            <div className="mx-auto w-full max-w-[760px]">
              <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                Еще из этой серии
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {relatedItems.map((relatedItem) => (
                  <Link
                    key={relatedItem.id}
                    href={`/media/${relatedItem.code}`}
                    className="group min-w-0 rounded-md border border-stone-300/80 bg-stone-50/50 p-2 transition-colors hover:border-stone-950 hover:bg-stone-100/70"
                  >
                    <span className="block aspect-square overflow-hidden rounded-sm border border-stone-300/70 bg-stone-200/50">
                      {relatedItem.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={relatedItem.coverUrl}
                          alt={`Обложка: ${relatedItem.title}`}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#d8cbb4,#f7efdf_52%,#c8b58f)] px-3 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                          Без обложки
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-950">
                        {relatedItem.title}
                      </span>
                      {relatedItem.releaseYear ? (
                        <span className="mt-1 block font-mono text-xs text-stone-500">
                          {relatedItem.releaseYear}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function DetailRatingStars({ score }: { score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span className="font-mono text-2xl leading-none tracking-[0.16em] text-current" aria-hidden="true">
      {"★".repeat(filledStars)}
      <span className="opacity-35">{"★".repeat(5 - filledStars)}</span>
    </span>
  );
}
