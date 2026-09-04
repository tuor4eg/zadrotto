import Link from "next/link";
import { Layers3, MessageSquareQuote, Sparkles, Star, Trophy } from "lucide-react";

import { getLatestAwardedAchievement } from "@/db/queries/achievements";
import { getSubmittedModerationRequestCountForAdmin } from "@/db/queries/admin-moderation-queue";
import { getAuthorDigitalProfile } from "@/db/queries/author-digital-profile";
import type { MainPageMediaItem } from "@/db/queries/main-page";
import {
  getAuthorReviewSummary,
  getLatestPublishedReviewCard,
} from "@/db/queries/contribution-reviews";
import { getLatestArchiveFeed } from "@/db/queries/archive-feed";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getPublishedEditorialCollections } from "@/db/queries/editorial-collections";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getAuthorPublishedMediaItemCount } from "@/db/queries/media-items";
import { getAuthorRatingSummary } from "@/db/queries/ratings";
import {
  getActiveQuiz,
  getActiveQuizParticipantState,
} from "@/db/queries/quizzes";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { ArchiveSiteFooter } from "@/components/archive/archive-site-footer";
import { getDailyDossier } from "@/lib/main-page/daily-dossier";
import { getAuthorResearchMessage } from "@/lib/main-page/author-research-message";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";

import { AdaptiveReviewExcerpt } from "./main/adaptive-review-excerpt";
import { ArchiveFeed } from "./main/archive-feed";
import { ArchiveRiddle } from "./main/archive-riddle";
import { MainHeader } from "./main/main-header";

export const dynamic = "force-dynamic";

type PublishedCollection = Awaited<ReturnType<typeof getPublishedEditorialCollections>>[number];

function EditorialCollectionsStrip({ collections }: { collections: PublishedCollection[] }) {
  if (collections.length === 0) return null;

  return <section className="archive-paper archive-panel overflow-hidden p-3 sm:p-4" aria-labelledby="main-collections-title">
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 id="main-collections-title" className="flex items-center gap-2 font-serif text-2xl leading-none text-stone-950"><Layers3 className="size-5 text-red-950/70" aria-hidden="true" />Подборки</h2>
      <Link href="/collections" className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">Смотреть всё →</Link>
    </div>
    <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:rgba(168,162,158,.45)_transparent]">
      {collections.map((collection) => <Link key={collection.id} href={`/collections/${collection.slug}`} className="group relative aspect-video w-[15rem] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-stone-900 shadow-md sm:w-[18rem] lg:w-[calc((100%-2.25rem)/4)] lg:min-w-[15rem]">
        {collection.coverUrl ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={collection.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        </> : <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,#44403c,#1c1917)]" />}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 p-3 text-white">
          <span className="block truncate text-lg font-semibold leading-tight drop-shadow">{collection.title}</span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-stone-300">{collection.itemsCount} записей</span>
        </span>
      </Link>)}
    </div>
  </section>;
}

function formatRelativeArchiveDate(value: Date) {
  const millisecondsPerDay = 86_400_000;
  const differenceInDays = Math.round((value.getTime() - Date.now()) / millisecondsPerDay);

  if (differenceInDays >= -1 && differenceInDays <= 0) {
    return new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" }).format(differenceInDays, "day");
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

function RecommendationRating({ item }: { item: MainPageMediaItem }) {
  const starRating = (item.averageScore ?? 0) / 20;

  return (
    <div className="mt-4 flex items-end gap-3">
      <strong className="font-mono text-3xl leading-none tabular-nums text-stone-950">
        {formatScore(item.averageScore)}
      </strong>
      <div>
        <div className="flex gap-0.5 text-amber-700" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => {
            const fillPercent = Math.max(0, Math.min(100, (starRating - index) * 100));

            return (
              <span key={index} className="relative size-4">
                <Star className="absolute inset-0 size-4 text-stone-400/60" />
                <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
                  <Star className="size-4 fill-current" />
                </span>
              </span>
            );
          })}
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-stone-600">
          {formatRatingsCount(item.ratingsCount)}
        </p>
      </div>
    </div>
  );
}

function DailyRecommendation({
  item,
  mediaTypeName,
}: {
  item: MainPageMediaItem | null;
  mediaTypeName: string | null;
}) {
  const coverUrl = item?.coverThumbUrl ?? item?.coverUrl;

  return (
    <section
      className="archive-paper archive-panel group relative flex min-h-[280px] flex-col overflow-hidden p-3 sm:p-4 lg:h-[280px] lg:min-h-0"
      aria-labelledby="main-daily-recommendation"
    >
      {item ? (
        <Link
          href={`/media/${item.code}`}
          aria-label={`Открыть досье «${item.title}»`}
          className="inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-stone-950"
          style={{ position: "absolute", zIndex: 20 }}
        />
      ) : null}
      {coverUrl ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-[38%] bg-cover bg-center"
            style={{
              backgroundImage: `url(${JSON.stringify(coverUrl)})`,
              maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.45) 24%, #000 48%)",
              position: "absolute",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.45) 24%, #000 48%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-[62%] w-[14%] backdrop-blur-[3px]"
            style={{
              maskImage: "linear-gradient(to right, transparent, #000 45%, transparent)",
              position: "absolute",
              WebkitMaskImage: "linear-gradient(to right, transparent, #000 45%, transparent)",
            }}
          />
        </>
      ) : null}

      <div className="relative z-10 flex flex-1 max-w-[72%] flex-col">
        <div className="flex h-8 shrink-0 items-start gap-2">
          <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-950/70" />
          <h2 id="main-daily-recommendation" className="font-serif text-2xl leading-none text-stone-950">
            Рекомендуем сегодня
          </h2>
        </div>
        <p className="mt-1 h-8 shrink-0 text-sm leading-6 text-stone-600">
          Высоко оценённая находка из нашей коллекции
        </p>

        {item ? (
          <div className="flex flex-1 flex-col pt-1">
            <h3 className="font-serif text-2xl leading-tight text-stone-950">{item.title}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600">
              {mediaTypeName ?? item.mediaType}
              {item.releaseYear ? ` · ${item.releaseYear}` : ""}
            </p>
            <RecommendationRating item={item} />
          </div>
        ) : (
          <p className="max-w-xs flex-1 pt-3 font-mono text-xs uppercase tracking-wider text-stone-500">
            Рекомендация появится вместе с подходящей записью.
          </p>
        )}
      </div>
    </section>
  );
}

type LatestReviewCard = Awaited<ReturnType<typeof getLatestPublishedReviewCard>>;

function LatestReview({
  mediaTypeName,
  review,
}: {
  mediaTypeName: string | null;
  review: LatestReviewCard;
}) {
  const coverUrl = review?.coverThumbUrl ?? review?.coverUrl;

  return (
    <section
      className="archive-paper archive-panel group relative flex min-h-[280px] flex-col overflow-hidden p-3 sm:p-4 lg:h-[280px] lg:min-h-0"
      aria-labelledby="main-latest-review"
    >
      {review ? (
        <Link
          href={`/reviews/${review.id}`}
          aria-label={`Читать рецензию на «${review.mediaItemTitle}»`}
          className="inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-stone-950"
          style={{ position: "absolute", zIndex: 20 }}
        />
      ) : null}
      {coverUrl ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-[38%] bg-cover bg-center"
            style={{
              backgroundImage: `url(${JSON.stringify(coverUrl)})`,
              maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.45) 24%, #000 48%)",
              position: "absolute",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.45) 24%, #000 48%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-[62%] w-[14%] backdrop-blur-[3px]"
            style={{
              maskImage: "linear-gradient(to right, transparent, #000 45%, transparent)",
              position: "absolute",
              WebkitMaskImage: "linear-gradient(to right, transparent, #000 45%, transparent)",
            }}
          />
        </>
      ) : null}

      <div className="relative z-10 flex flex-1 max-w-[72%] flex-col">
        <div className="flex h-8 shrink-0 items-start gap-2">
          <MessageSquareQuote aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-950/70" />
          <h2 id="main-latest-review" className="font-serif text-2xl leading-none text-stone-950">
            Мнение из архива
          </h2>
        </div>
        <p className="mt-1 h-8 shrink-0 text-sm leading-6 text-stone-600">
          Свежая рецензия одного из наших авторов
        </p>

        {review ? (
          <div className="flex min-h-0 flex-1 flex-col pt-1">
            <h3 className="shrink-0 font-serif text-xl leading-tight text-stone-950">{review.mediaItemTitle}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600">
              {mediaTypeName ?? review.mediaType}
              {review.releaseYear ? ` · ${review.releaseYear}` : ""}
            </p>
            <AdaptiveReviewExcerpt text={review.excerpt} />
            <p className="mt-3 shrink-0 text-xs text-stone-600">— {review.authorName}</p>
          </div>
        ) : (
          <p className="max-w-xs flex-1 pt-3 font-mono text-xs uppercase tracking-wider text-stone-500">
            Рецензия появится после первой публикации.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function MainPage() {
  const [author, adminUser] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()]);
  const [activeQuiz, adminNotificationCount, dailyDossier, mediaTypes, editorialCollections] = await Promise.all([
    author ? getActiveQuiz() : Promise.resolve(null),
    adminUser ? getSubmittedModerationRequestCountForAdmin() : Promise.resolve(0),
    getDailyDossier(author?.id),
    getEffectiveMediaTypeOptions(author?.id),
    getPublishedEditorialCollections(),
  ]);
  const dailyDossierMediaTypeName = dailyDossier
    ? mediaTypes.find((mediaType) => mediaType.code === dailyDossier.mediaType)?.name ?? null
    : null;
  const enabledMediaTypeCodes = mediaTypes
    .filter((mediaType) => mediaType.isEnabled)
    .map((mediaType) => mediaType.code);
  const latestReview = await getLatestPublishedReviewCard(
    enabledMediaTypeCodes,
  );
  const archiveFeed = await getLatestArchiveFeed(mediaTypes.filter((mediaType) => mediaType.isEnabled));
  const latestReviewMediaTypeName = latestReview
    ? mediaTypes.find((mediaType) => mediaType.code === latestReview.mediaType)?.name ?? null
    : null;
  const activeQuizParticipant = activeQuiz && author
    ? await getActiveQuizParticipantState(author.id)
    : null;
  const isActiveQuizParticipant = activeQuizParticipant?.quizId === activeQuiz?.id;
  const authorHeroStatistics = author
    ? await Promise.all([
        getAuthorDigitalProfile(author.id, enabledMediaTypeCodes),
        getAuthorRatingSummary(author.id, enabledMediaTypeCodes),
        getAuthorReviewSummary(author.id, enabledMediaTypeCodes),
        getAuthorPublishedMediaItemCount(author.id, enabledMediaTypeCodes),
        getLatestAwardedAchievement(author.id),
      ]).then(([digitalProfile, ratingSummary, reviewSummary, contributionCount, latestAchievement]) => ({
        averageScore: ratingSummary.averageScore,
        contributionCount,
        digitalProfile,
        latestAchievement,
        latestRating: ratingSummary.latestRatings[0] ?? null,
        ratingsCount: ratingSummary.ratingsCount,
        reviewCount: reviewSummary.reviewsCount,
      }))
    : null;
  const latestAcquaintanceItem = author && authorHeroStatistics?.latestRating
    ? (await getMediaItemTilesByIds([authorHeroStatistics.latestRating.mediaItemId], author.id))[0] ?? null
    : null;
  const latestAcquaintance = latestAcquaintanceItem && authorHeroStatistics?.latestRating
    ? {
        code: latestAcquaintanceItem.code,
        coverUrl: latestAcquaintanceItem.coverThumbUrl ?? latestAcquaintanceItem.coverUrl,
        score: authorHeroStatistics.latestRating.score,
        title: latestAcquaintanceItem.title,
        updatedAt: authorHeroStatistics.latestRating.updatedAt,
      }
    : null;
  const authorHeroStatisticItems = authorHeroStatistics
    ? [
        { label: "Оценок", rawValue: authorHeroStatistics.ratingsCount },
        { label: "Средняя оценка", rawValue: authorHeroStatistics.averageScore },
        { label: "Рецензий", rawValue: authorHeroStatistics.reviewCount },
        { label: "Добавлено в архив", rawValue: authorHeroStatistics.contributionCount },
      ]
        .filter((statistic): statistic is { label: string; rawValue: number } => (
          statistic.rawValue !== null && statistic.rawValue > 0
        ))
        .map((statistic) => ({
          label: statistic.label,
          value: statistic.label === "Средняя оценка"
            ? formatScore(statistic.rawValue)
            : statistic.rawValue.toLocaleString("ru-RU"),
        }))
    : [];
  const researchMessage = author && authorHeroStatistics
    ? getAuthorResearchMessage({
        authorId: author.id,
        averageScore: authorHeroStatistics.averageScore,
        contributionCount: authorHeroStatistics.contributionCount,
        digitalProfile: authorHeroStatistics.digitalProfile,
        ratingsCount: authorHeroStatistics.ratingsCount,
        reviewCount: authorHeroStatistics.reviewCount,
      })
    : null;
  const hasLatestActivity = Boolean(
    author
    && authorHeroStatisticItems.length > 0
    && (latestAcquaintance || authorHeroStatistics?.latestAchievement),
  );

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <MainHeader
          adminNotificationCount={adminNotificationCount}
          author={author}
          currentAdminUser={Boolean(adminUser)}
        />
        <div className={hasLatestActivity ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]" : undefined}>
          <section
            className="archive-paper archive-panel flex items-center overflow-hidden px-6 py-6 sm:px-10 lg:px-14 lg:py-7"
            aria-labelledby="main-intro-title"
          >
          <div
            aria-hidden="true"
            style={{
              backgroundImage: "url('/back_archieve.png')",
              backgroundPosition: "right center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "auto 100%",
              aspectRatio: "2 / 1",
              height: "100%",
              maskImage:
                "linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.08) 12%, rgba(0, 0, 0, 0.35) 28%, rgba(0, 0, 0, 0.78) 46%, #000 62%, #000 100%)",
              position: "absolute",
              right: 0,
              top: 0,
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.08) 12%, rgba(0, 0, 0, 0.35) 28%, rgba(0, 0, 0, 0.78) 46%, #000 62%, #000 100%)",
              zIndex: 0,
            }}
          />
          {author && authorHeroStatistics && authorHeroStatisticItems.length > 0 ? (
            <div className="w-full lg:max-w-[66%]">
              <h1
                id="main-intro-title"
                className="font-serif text-4xl leading-[0.95] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl"
              >
                {researchMessage?.title}
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-7 text-stone-700 sm:text-lg">
                {researchMessage?.body}
              </p>
              <Link
                href={researchMessage?.cta.href ?? "/archive"}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-stone-900 px-5 font-mono text-xs uppercase tracking-[0.12em] text-stone-50 transition-colors hover:bg-red-950"
              >
                {researchMessage?.cta.label ?? "Продолжить исследование"}
              </Link>
              {authorHeroStatisticItems.length > 0 ? (
                <dl className="mt-5 grid max-w-4xl grid-cols-2 sm:grid-cols-4">
                {authorHeroStatisticItems.map((statistic, index) => (
                  <div
                    key={statistic.label}
                    className={`flex flex-col px-3 py-1 text-center first:pl-0 sm:px-6 ${index % 2 === 1 ? "border-l border-stone-400/30" : ""} ${index > 0 ? "sm:border-l sm:border-stone-400/30" : ""}`}
                  >
                    <dt className="order-2 mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">
                      {statistic.label}
                    </dt>
                    <dd className="order-1 font-serif text-2xl leading-none tabular-nums text-stone-950">{statistic.value}</dd>
                  </div>
                ))}
                </dl>
              ) : null}
            </div>
          ) : (
          <div className="max-w-2xl">
            <h1
              id="main-intro-title"
              className="font-serif text-4xl leading-[0.95] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl"
            >
              Начни свою историю
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-stone-700 sm:text-lg">
              Оценивай, высказывай мнения, создавай личные серии и смотри, как из этого складывается твой культурный след.
            </p>
            <button
              type="button"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-stone-900 px-5 font-mono text-xs uppercase tracking-[0.12em] text-stone-50 transition-colors hover:bg-red-950"
            >
              Начать историю
            </button>
          </div>
          )}
          </section>
          {hasLatestActivity ? (
            <aside
              className={`archive-paper archive-panel w-full p-4 text-left text-stone-950 lg:p-5 ${latestAcquaintance && authorHeroStatistics?.latestAchievement ? "grid grid-rows-2" : "flex flex-col justify-center"}`}
              aria-label="Последняя активность"
            >
              {latestAcquaintance ? (
                <div className="flex w-full flex-col items-start justify-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600">
                    Последняя оценка
                  </p>
                  <Link href={`/media/${latestAcquaintance.code}`} className="mt-2 flex items-center gap-4">
                    {latestAcquaintance.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={latestAcquaintance.coverUrl}
                        alt=""
                        className="h-28 w-20 shrink-0 rounded object-cover shadow-lg lg:h-32 lg:w-[5.5rem]"
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="line-clamp-2 font-serif text-xl leading-tight">
                        {latestAcquaintance.title}
                      </span>
                      <span className="mt-1 block text-sm text-stone-600">
                        Оценка {formatScore(latestAcquaintance.score)} · {formatRelativeArchiveDate(latestAcquaintance.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </div>
              ) : null}
              {authorHeroStatistics?.latestAchievement ? (
                <div className={`flex w-full flex-col items-start justify-center ${latestAcquaintance ? "border-t-2 border-stone-700/70" : ""}`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600">
                    Новое достижение
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    <Link
                      href="/author/achievements"
                      aria-label="Открыть мои ачивки"
                      className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900 focus-visible:ring-offset-2"
                    >
                      {authorHeroStatistics.latestAchievement.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={authorHeroStatistics.latestAchievement.imageUrl}
                          alt=""
                          className="size-20 rounded-full object-cover shadow-lg lg:size-24"
                        />
                      ) : (
                        <span className="grid size-20 place-items-center rounded-full bg-amber-100/90 text-amber-900 shadow-lg lg:size-24">
                          <Trophy className="size-10 lg:size-12" aria-hidden="true" />
                        </span>
                      )}
                    </Link>
                    <span className="line-clamp-2 font-serif text-xl leading-tight">
                      {authorHeroStatistics.latestAchievement.name}
                    </span>
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <DailyRecommendation item={dailyDossier} mediaTypeName={dailyDossierMediaTypeName} />
          <ArchiveRiddle
            isCompleted={activeQuizParticipant?.completed === true}
            isParticipating={isActiveQuizParticipant}
            quiz={activeQuiz}
          />
          <LatestReview mediaTypeName={latestReviewMediaTypeName} review={latestReview} />
        </div>

        <EditorialCollectionsStrip collections={editorialCollections} />

        <ArchiveFeed items={archiveFeed} />
        <ArchiveSiteFooter />
      </div>
    </main>
  );
}
