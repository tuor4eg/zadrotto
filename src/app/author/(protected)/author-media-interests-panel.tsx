"use client";

import { useId, useState } from "react";
import { Shapes } from "lucide-react";

import {
  AuthorMediaInterestsDonut,
  type AuthorMediaInterestItem,
} from "./author-media-interests-donut";

export type AuthorRatingYearItem = {
  count: number;
  year: number;
};

type ChartPoint = AuthorRatingYearItem & {
  x: number;
  y: number;
};

const CHART = {
  bottom: 142,
  left: 36,
  right: 306,
  top: 12,
};

export function getNiceScaleMaximum(value: number, targetTicks = 4) {
  if (value <= 0) return targetTicks;

  const roughStep = value / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const niceStep = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;

  return niceStep * magnitude * targetTicks;
}

export function getYearTickIndexes(length: number, maximumTicks = 5) {
  if (length <= maximumTicks) return Array.from({ length }, (_, index) => index);

  return Array.from(
    new Set(
      Array.from({ length: maximumTicks }, (_, index) =>
        Math.round((index * (length - 1)) / (maximumTicks - 1)),
      ),
    ),
  );
}

export function getSmoothLinePath(points: Array<Pick<ChartPoint, "x" | "y">>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const middleX = (previous.x + current.x) / 2;
    path += ` C ${middleX} ${previous.y}, ${middleX} ${current.y}, ${current.x} ${current.y}`;
  }

  return path;
}

function AuthorRatingsByReleaseYearChart({ items }: { items: AuthorRatingYearItem[] }) {
  const titleId = useId();
  const descriptionId = useId();

  if (items.length === 0) {
    return (
      <div className="grid min-h-[10.625rem] place-items-center text-center font-mono text-xs text-stone-500">
        Пока нет оценённых записей с годом выпуска.
      </div>
    );
  }

  const maximumCount = Math.max(...items.map(({ count }) => count));
  const scaleMaximum = getNiceScaleMaximum(maximumCount);
  const yTicks = Array.from({ length: 5 }, (_, index) => (scaleMaximum / 4) * index);
  const points = items.map((item, index) => ({
    ...item,
    x: items.length === 1
      ? (CHART.left + CHART.right) / 2
      : CHART.left + (index / (items.length - 1)) * (CHART.right - CHART.left),
    y: CHART.bottom - (item.count / scaleMaximum) * (CHART.bottom - CHART.top),
  }));
  const yearTickIndexes = getYearTickIndexes(items.length);
  const description = items.map(({ count, year }) => `${year}: ${count}`).join("; ");

  return (
    <svg
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="block h-auto min-h-[10.625rem] w-full overflow-visible"
      role="img"
      viewBox="0 0 320 170"
    >
      <title id={titleId}>Оценки по годам выпуска записей</title>
      <desc id={descriptionId}>{description}</desc>
      {yTicks.map((tick) => {
        const y = CHART.bottom - (tick / scaleMaximum) * (CHART.bottom - CHART.top);

        return (
          <g key={tick} aria-hidden="true">
            <line x1={CHART.left} x2={CHART.right} y1={y} y2={y} className="stroke-stone-300/70" strokeDasharray="2 3" />
            <text x={CHART.left - 7} y={y} textAnchor="end" dominantBaseline="middle" className="fill-stone-500 font-mono text-[8px] tabular-nums">
              {tick}
            </text>
          </g>
        );
      })}
      <path
        aria-hidden="true"
        d={getSmoothLinePath(points)}
        className="fill-none stroke-red-900"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      {points.map((point) => (
        <g key={point.year} aria-hidden="true">
          <circle cx={point.x} cy={point.y} r="5" className="fill-stone-50 stroke-red-900" strokeWidth="2" />
          <title>{point.year}: {point.count}</title>
        </g>
      ))}
      {yearTickIndexes.map((index) => {
        const point = points[index];

        return (
          <text key={point.year} x={point.x} y="160" textAnchor="middle" className="fill-stone-600 font-mono text-[8px] tabular-nums">
            {point.year}
          </text>
        );
      })}
    </svg>
  );
}

export function AuthorMediaInterestsPanel({
  items,
  title = "Мои интересы",
  yearlyItems,
}: {
  items: AuthorMediaInterestItem[];
  title?: string;
  yearlyItems: AuthorRatingYearItem[];
}) {
  const [activeTab, setActiveTab] = useState<"types" | "years">("types");

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-stone-400/25 pb-3">
        <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
          <Shapes className="size-5 shrink-0 text-red-950/70" />
          {title}
        </h2>
        <div className="flex shrink-0 rounded-md border border-stone-300/80 bg-stone-50/70 p-0.5" role="tablist" aria-label="Вид интересов">
          {([['types', 'По типам'], ['years', 'По годам']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => setActiveTab(value)}
              className={`rounded px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors sm:px-2.5 sm:text-[10px] ${
                activeTab === value
                  ? "bg-red-900/10 text-red-950 shadow-sm"
                  : "text-stone-500 hover:bg-stone-200/70 hover:text-stone-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {activeTab === "types" ? (
          <AuthorMediaInterestsDonut items={items} />
        ) : (
          <AuthorRatingsByReleaseYearChart items={yearlyItems} />
        )}
      </div>
    </>
  );
}
