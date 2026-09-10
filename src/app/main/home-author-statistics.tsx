"use client";

import { CalendarRange, ChartNoAxesColumn } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { AuthorStatisticsRatingSummary } from "@/components/author/author-statistics";
import { formatScore, RATING_SCORE_VALUES } from "@/lib/ratings/score";
import { getRatingTone, RATING_BAR_TONE_CLASS_NAMES } from "@/lib/ratings/tone";

type ReleaseYearItem = AuthorStatisticsRatingSummary["releaseYearDistribution"][number];

function DraggableTimeline({ children }: { children: ReactNode }) {
  const dragRef = useRef<{
    edgeDirection: -1 | 1 | null;
    pointerId: number;
    startScrollLeft: number;
    startX: number;
  } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    dragRef.current = {
      edgeDirection: null,
      pointerId: event.pointerId,
      startScrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (drag.edgeDirection === null && deltaX !== 0) {
      drag.edgeDirection = drag.startScrollLeft === 0 && deltaX < 0 ? -1 : 1;
    }
    event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX * (drag.edgeDirection ?? 1);
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className="relative min-w-0 cursor-grab overflow-x-auto pb-1 [direction:rtl] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      onPointerCancel={finishPointerDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
    >
      {children}
    </div>
  );
}

export function fillReleaseYearTimeline(items: ReleaseYearItem[]) {
  if (items.length === 0) return [];

  const countsByYear = new Map(items.map((item) => [item.year, item.count]));
  const firstYear = Math.min(...countsByYear.keys());
  const lastYear = Math.max(...countsByYear.keys());

  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
    const year = firstYear + index;
    return { count: countsByYear.get(year) ?? 0, year };
  });
}

export function getCountAxisTicks(maximumCount: number) {
  if (maximumCount <= 0) return [0, 1];

  const roughStep = maximumCount / 3;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const niceStep = Math.max(1, (
    normalizedStep <= 1 ? 1
      : normalizedStep <= 2 ? 2
        : normalizedStep <= 5 ? 5
          : 10
  ) * magnitude);
  const scaleMaximum = Math.ceil(maximumCount / niceStep) * niceStep;

  return Array.from(
    { length: Math.round(scaleMaximum / niceStep) + 1 },
    (_, index) => index * niceStep,
  );
}

function RatingsByReleaseYearBars({
  items,
}: {
  items: AuthorStatisticsRatingSummary["releaseYearDistribution"];
}) {
  if (items.length === 0) {
    return (
      <div className="grid min-h-44 place-items-center text-center font-mono text-xs text-stone-500">
        Пока нет оценённых записей с годом выпуска.
      </div>
    );
  }

  const timelineItems = fillReleaseYearTimeline(items);
  const maximumCount = Math.max(1, ...items.map(({ count }) => count));
  const yTicks = getCountAxisTicks(maximumCount);
  const scaleMaximum = yTicks.at(-1) ?? maximumCount;
  const description = items.map(({ count, year }) => `${year}: ${count}`).join("; ");
  const gridStyle = {
    "--year-column-count": timelineItems.length,
    "--year-desktop-width": `${Math.max(100, timelineItems.length * 2)}%`,
    "--year-mobile-width": `max(100%, ${timelineItems.length * 10}px)`,
  } as CSSProperties;

  return (
    <div
      aria-label={`Количество оценённых записей по годам выпуска. ${description}`}
      className="flex min-w-0 items-start"
      role="img"
    >
      <div aria-hidden="true" className="relative h-44 w-8 shrink-0 border-r border-stone-500/15">
        {yTicks.map((tick) => (
          <span
            key={tick}
            className="absolute right-1 translate-y-1/2 font-mono text-[8px] font-medium leading-none tabular-nums text-stone-700/85"
            style={{ bottom: `${(tick / scaleMaximum) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-44">
          {yTicks.map((tick) => (
            <span
              key={tick}
              className="absolute inset-x-0 border-t border-stone-500/10"
              style={{ bottom: `${(tick / scaleMaximum) * 100}%` }}
            />
          ))}
        </div>
        <DraggableTimeline>
          <div
            className="grid h-44 min-w-0 w-[var(--year-mobile-width)] grid-cols-[repeat(var(--year-column-count),minmax(0,1fr))] items-end gap-px px-3 [direction:ltr] sm:gap-1 lg:w-[var(--year-desktop-width)] lg:gap-px"
            style={gridStyle}
          >
            {timelineItems.map(({ count, year }) => {
              const heightPercent = count > 0 ? Math.max(3, (count / scaleMaximum) * 100) : 0;

              return (
                <div key={year} className="flex h-full min-w-0 flex-col justify-end text-center" title={count > 0 ? `${year}: ${count}` : undefined}>
                  <span
                    className={`mx-auto block w-full max-w-8 rounded-t-sm ${count > 0 ? "bg-red-950/70" : "bg-transparent"}`}
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="absolute sr-only">{year}: {count}</span>
                </div>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="mt-1 grid min-w-0 w-[var(--year-mobile-width)] grid-cols-[repeat(var(--year-column-count),minmax(0,1fr))] gap-px px-3 text-center [direction:ltr] sm:gap-1 lg:w-[var(--year-desktop-width)] lg:gap-px"
            style={gridStyle}
          >
            {timelineItems.map(({ year }, index) => (
              <span key={year} className="font-mono text-[9px] font-semibold leading-none tabular-nums text-stone-600">
                {index === 0 || index === timelineItems.length - 1 || year % 10 === 0 ? year : null}
              </span>
            ))}
          </div>
        </DraggableTimeline>
      </div>
    </div>
  );
}

function ScoreDistributionBars({
  items,
}: {
  items: AuthorStatisticsRatingSummary["scoreDistribution"];
}) {
  const distributionByScore = new Map(items.map((item) => [item.score, item.ratingsCount]));
  const maximumCount = Math.max(1, ...items.map((item) => item.ratingsCount));
  const scores = [...RATING_SCORE_VALUES].reverse();

  return (
    <div aria-label="Распределение количества оценок от 1 до 10" className="flex flex-col" role="img">
      <div className="relative grid h-44 shrink-0 grid-cols-10 items-end gap-1 border-b border-stone-400/50 sm:gap-1.5">
        {scores.map((score) => {
          const count = distributionByScore.get(score) ?? 0;
          const heightPercent = count > 0 ? Math.max(3, (count / maximumCount) * 86) : 0;
          const toneClassName = RATING_BAR_TONE_CLASS_NAMES[getRatingTone(score)];

          return (
            <span key={score} className="relative h-full min-w-0">
              <span className="absolute inset-x-0 text-center font-mono text-[10px] font-semibold leading-none tabular-nums text-stone-700" style={{ bottom: `calc(${heightPercent}% + 0.125rem)` }}>
                {count}
              </span>
              <span className={`absolute bottom-0 left-1/2 block w-full max-w-7 -translate-x-1/2 rounded-t-sm ${count > 0 ? toneClassName : "bg-transparent"}`} style={{ height: `${heightPercent}%` }} />
            </span>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-10 gap-1 text-center sm:gap-1.5">
        {scores.map((score) => (
          <span key={score} className="font-mono text-[10px] font-semibold leading-none tabular-nums text-stone-950">
            {formatScore(score)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HomeAuthorStatistics({
  ratingSummary,
}: {
  ratingSummary: AuthorStatisticsRatingSummary;
}) {
  return (
    <section className="archive-paper archive-panel overflow-hidden p-4 sm:p-5" aria-label="Статистика пользователя">
      <div className="grid gap-5 lg:grid-cols-3 lg:gap-3">
        <div className="lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 font-serif text-lg leading-none text-stone-900">
            <CalendarRange className="size-4 text-red-950/65" aria-hidden="true" />
            Мои интересы по годам
          </h3>
          <RatingsByReleaseYearBars items={ratingSummary.releaseYearDistribution} />
        </div>
        <div className="border-t border-stone-400/25 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h3 className="mb-3 flex items-center gap-2 font-serif text-lg leading-none text-stone-900">
            <ChartNoAxesColumn className="size-4 text-red-950/65" aria-hidden="true" />
            Распределение оценок
          </h3>
          <ScoreDistributionBars items={ratingSummary.scoreDistribution} />
        </div>
      </div>
    </section>
  );
}
