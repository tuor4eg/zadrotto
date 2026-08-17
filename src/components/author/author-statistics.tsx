import Link from "next/link";
import { Archive, CalendarCheck, ChartNoAxesColumn, FileText, Gauge, Info, Star } from "lucide-react";

import { AuthorMediaInterestsPanel } from "@/app/author/(protected)/author-media-interests-panel";
import { ResponsiveTileGrid, type ResponsiveTileDescriptor } from "@/components/archive/responsive-tile-grid";
import { Card, CardContent } from "@/components/ui/card";
import type { MediaTypeOption } from "@/lib/media/types";
import { getMediaTypeLabel, sortMediaTypesByCount } from "@/lib/media/types";
import { RATING_SCORE_VALUES, formatScore } from "@/lib/ratings/score";
import { RATING_BAR_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone";

export type AuthorStatisticsRatingSummary = {
  averageScore: number | null;
  currentYearRatingsCount: number;
  distribution: { mediaType: string; ratingsCount: number }[];
  ratingsCount: number;
  releaseYearDistribution: { count: number; year: number }[];
  scoreDistribution: { ratingsCount: number; score: number }[];
};

export function AuthorStatistics({
  interestsTitle = "Мои интересы",
  latestRatingTiles,
  latestReviewTiles,
  mediaTypes,
  ratingSummary,
  ratingsHref,
  reviewCount,
  reviewsHref,
  contributionCount,
}: {
  interestsTitle?: string;
  latestRatingTiles: ResponsiveTileDescriptor[];
  latestReviewTiles: ResponsiveTileDescriptor[];
  mediaTypes: readonly MediaTypeOption[];
  ratingSummary: AuthorStatisticsRatingSummary;
  ratingsHref: string;
  reviewCount: number;
  reviewsHref: string;
  contributionCount: number;
}) {
  const distributionByMediaType = new Map(ratingSummary.distribution.map((item) => [item.mediaType, item.ratingsCount]));
  const mediaTypesByRatingCount = sortMediaTypesByCount(mediaTypes, ratingSummary.distribution.map((item) => ({ count: item.ratingsCount, mediaType: item.mediaType })));
  const interestItems = mediaTypesByRatingCount.map((mediaType) => ({ code: mediaType.code, count: distributionByMediaType.get(mediaType.code) ?? 0, label: getMediaTypeLabel(mediaType.code, mediaTypes) }));
  const distributionByScore = new Map(ratingSummary.scoreDistribution.map((item) => [item.score, item.ratingsCount]));
  const maxScoreDistributionCount = Math.max(1, ...ratingSummary.scoreDistribution.map((item) => item.ratingsCount));
  const scoreDistributionValues = [...RATING_SCORE_VALUES].reverse();
  const statistics = [
    { Icon: Star, label: "Оценок", value: ratingSummary.ratingsCount },
    { Icon: Gauge, label: "Средняя", value: formatScore(ratingSummary.averageScore) },
    { Icon: CalendarCheck, label: "Оценено в этом году", value: ratingSummary.currentYearRatingsCount },
    { Icon: FileText, label: "Рецензий", value: reviewCount },
    { Icon: Archive, label: "Добавлено в архив", value: contributionCount },
  ];

  return <div className="author-dashboard flex flex-col gap-3">
    <section className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,0.65fr)]">
      <Card className="archive-paper archive-panel h-full"><CardContent className="p-4 sm:px-5 sm:pt-5"><AuthorMediaInterestsPanel items={interestItems} yearlyItems={ratingSummary.releaseYearDistribution} title={interestsTitle} /></CardContent></Card>
      <Card className="archive-paper archive-panel h-full"><CardContent className="flex h-full flex-col p-4 sm:px-5 sm:pt-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3"><h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"><ChartNoAxesColumn className="size-5 shrink-0 text-red-950/70" />Распределение оценок</h2></div>
        <div aria-label="Распределение количества оценок от 1 до 10" className="flex min-h-0 flex-1 flex-col" role="img">
          <div className="relative grid min-h-32 flex-1 grid-cols-10 items-end gap-1 border-b border-stone-400/50 sm:gap-1.5">
            {scoreDistributionValues.map((score) => {
              const count = distributionByScore.get(score) ?? 0;
              const toneClassName = RATING_BAR_TONE_CLASS_NAMES[getRatingTone(score)];
              const barHeightPercent = count > 0 ? Math.max(2, (count / maxScoreDistributionCount) * 88) : 0;
              return <span key={score} className="relative h-full min-w-0"><span className="absolute inset-x-0 text-center font-mono text-[10px] font-semibold leading-none tabular-nums text-stone-700" style={{ bottom: `calc(${barHeightPercent}% + 0.125rem)` }}>{count}</span><span className={`absolute bottom-0 left-1/2 block w-full max-w-6 -translate-x-1/2 rounded-t-sm ${count > 0 ? toneClassName : "bg-transparent"}`} style={{ height: `${barHeightPercent}%` }} /></span>;
            })}
          </div>
          <div className="mt-1 grid grid-cols-10 gap-1 text-center sm:gap-1.5">{scoreDistributionValues.map((score) => <span key={score} className="font-mono text-[10px] font-semibold leading-none tabular-nums text-stone-950">{formatScore(score)}</span>)}</div>
        </div>
      </CardContent></Card>
      <Card className="archive-paper archive-panel h-full"><CardContent className="p-4 sm:px-5 sm:pt-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3"><h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"><Info className="size-5 shrink-0 text-red-950/70" />Статистика</h2></div>
        <div className="divide-y divide-dashed divide-stone-400/35">{statistics.map(({ Icon, label, value }) => <div key={label} className="flex items-center justify-between gap-4 py-2"><span className="flex items-center gap-2 font-serif text-lg"><Icon className="size-4 text-red-950/65" />{label}</span><strong className="shrink-0 font-mono text-sm font-normal tabular-nums text-stone-600">{value}</strong></div>)}</div>
      </CardContent></Card>
    </section>
    <section className="grid gap-3 lg:grid-cols-2">
      <Card className="archive-paper archive-panel p-4 sm:px-5 sm:pt-5"><div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3"><h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"><Star className="size-5 shrink-0 text-red-950/70" />Последние оценки</h2><Link href={ratingsHref} className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">Смотреть всё →</Link></div><ResponsiveTileGrid initialColumnCount={3} items={latestRatingTiles} variant="top" /></Card>
      <Card className="archive-paper archive-panel p-4 sm:px-5 sm:pt-5"><div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3"><h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"><FileText className="size-5 shrink-0 text-red-950/70" />Последние рецензии</h2><Link href={reviewsHref} className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">Смотреть всё →</Link></div><ResponsiveTileGrid initialColumnCount={3} items={latestReviewTiles} variant="top" /></Card>
    </section>
  </div>;
}
