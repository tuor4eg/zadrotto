"use client";

import { useId, useState } from "react";

export type AuthorMediaInterestItem = {
  code: string;
  count: number;
  label: string;
};

export type DonutSegment = AuthorMediaInterestItem & {
  color: string;
  dashLength: number;
  dashOffset: number;
  labelX: number;
  labelY: number;
  leaderAnchorX: number;
  leaderAnchorY: number;
  leaderEndX: number;
  percent: number;
  side: "left" | "right";
};

const CENTER_X = 130;
const CENTER_Y = 85;
const DONUT_RADIUS = 48;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const FALLBACK_COLORS = ["#7c6f64", "#8c7765", "#69766e", "#7c7180", "#82765b", "#687580"];
const MEDIA_TYPE_COLORS: Record<string, string> = {
  anime: "#8a6873",
  book: "#786b58",
  comic: "#76677c",
  film: "#66747a",
  game: "#6c765f",
  other: "#82776c",
  series: "#7d655f",
};

function hashCode(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function spreadDonutLabelPositions(
  values: number[],
  minimum = 12,
  maximum = 158,
  gap = 18,
) {
  const positions = [...values].sort((a, b) => a - b);
  const effectiveGap = positions.length > 1
    ? Math.min(gap, (maximum - minimum) / (positions.length - 1))
    : 0;

  for (let index = 0; index < positions.length; index += 1) {
    const target = Math.max(minimum, Math.min(maximum, positions[index]));
    positions[index] = Math.max(target, (positions[index - 1] ?? -Infinity) + effectiveGap);
  }

  const overflow = Math.max(0, (positions.at(-1) ?? maximum) - maximum);
  if (overflow > 0) {
    for (let index = 0; index < positions.length; index += 1) positions[index] -= overflow;
  }

  for (let index = positions.length - 2; index >= 0; index -= 1) {
    positions[index] = Math.min(positions[index], positions[index + 1] - effectiveGap);
  }

  return positions.map((position) => Math.max(minimum, Math.min(maximum, position)));
}

export function formatDonutLabel(label: string, maximumLength = 16) {
  if (label.length <= maximumLength) return label;
  return `${label.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}

export function getMediaInterestColor(code: string) {
  return MEDIA_TYPE_COLORS[code] ?? FALLBACK_COLORS[hashCode(code) % FALLBACK_COLORS.length];
}

export function getDonutSegments(items: AuthorMediaInterestItem[]): DonutSegment[] {
  const positiveItems = items.filter(({ count }) => count > 0);
  const total = positiveItems.reduce((sum, { count }) => sum + count, 0);
  let consumedLength = 0;
  const baseSegments = positiveItems.map((item) => {
    const segmentLength = (item.count / total) * DONUT_CIRCUMFERENCE;
    const gap = Math.min(2.5, segmentLength * 0.25);
    const middleAngle = -90 + ((consumedLength + segmentLength / 2) / DONUT_CIRCUMFERENCE) * 360;
    const radians = (middleAngle * Math.PI) / 180;
    const side = Math.cos(radians) < 0 ? "left" as const : "right" as const;
    const segment = {
      ...item,
      color: getMediaInterestColor(item.code),
      dashLength: Math.max(0, segmentLength - gap),
      dashOffset: consumedLength === 0 ? 0 : -consumedLength,
      leaderAnchorX: CENTER_X + Math.cos(radians) * (DONUT_RADIUS + 4),
      leaderAnchorY: CENTER_Y + Math.sin(radians) * (DONUT_RADIUS + 4),
      percent: (item.count / total) * 100,
      side,
      targetY: CENTER_Y + Math.sin(radians) * (DONUT_RADIUS + 16),
    };

    consumedLength += segmentLength;
    return segment;
  });
  const labelPositions = new Map<string, number>();

  for (const side of ["left", "right"] as const) {
    const sideSegments = baseSegments
      .filter((segment) => segment.side === side)
      .sort((a, b) => a.targetY - b.targetY);
    const positions = spreadDonutLabelPositions(sideSegments.map(({ targetY }) => targetY));
    sideSegments.forEach((segment, index) => labelPositions.set(segment.code, positions[index]));
  }

  return baseSegments.map((baseSegment) => {
    const { targetY, ...segment } = baseSegment;
    void targetY;

    return {
      ...segment,
      labelX: segment.side === "left" ? 55 : 205,
      labelY: labelPositions.get(segment.code) ?? CENTER_Y,
      leaderEndX: segment.side === "left" ? 61 : 199,
    };
  });
}

export function getMediaInterestTotal(items: AuthorMediaInterestItem[]) {
  return items.reduce((sum, { count }) => sum + Math.max(0, count), 0);
}

export function getDonutDescription(items: AuthorMediaInterestItem[]) {
  const segments = getDonutSegments(items);
  const total = getMediaInterestTotal(items);

  if (total === 0) return "Пока нет оценок по типам медиа.";

  const distribution = segments
    .map(({ count, label, percent }) => `${label}: ${count} оценок, ${Math.round(percent)}%`)
    .join("; ");
  return `Всего ${total} оценок. ${distribution}.`;
}

export function AuthorMediaInterestsDonut({ items }: { items: AuthorMediaInterestItem[] }) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const total = getMediaInterestTotal(items);
  const segments = getDonutSegments(items);
  const activeCode = hoveredCode;
  const activeItem = segments.find(({ code }) => code === activeCode) ?? null;

  return (
    <svg
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="mx-auto block h-auto w-full max-w-[30rem] overflow-visible"
      role="img"
      viewBox="0 0 260 170"
    >
      <title id={titleId}>Интересы по типам медиа</title>
      <desc id={descriptionId}>{getDonutDescription(items)}</desc>
      <circle
        aria-hidden="true"
        className="fill-none stroke-stone-200"
        cx={CENTER_X}
        cy={CENTER_Y}
        r={DONUT_RADIUS}
        strokeWidth="14"
      />
      {segments.map((segment) => {
        const isActive = segment.code === activeCode;

        return (
          <g
            key={segment.code}
            aria-hidden="true"
            className="outline-none"
            onPointerEnter={() => setHoveredCode(segment.code)}
            onPointerLeave={() => setHoveredCode(null)}
          >
            <circle
              aria-hidden="true"
              className="cursor-pointer fill-none transition-[opacity,stroke-width] duration-150 motion-reduce:transition-none"
              cx={CENTER_X}
              cy={CENTER_Y}
              r={DONUT_RADIUS}
              stroke={segment.color}
              strokeDasharray={`${segment.dashLength} ${DONUT_CIRCUMFERENCE - segment.dashLength}`}
              strokeDashoffset={segment.dashOffset}
              strokeLinecap="butt"
              strokeWidth={isActive ? 17 : 14}
              style={{ opacity: activeCode && !isActive ? 0.4 : 1 }}
              transform={`rotate(-90 ${CENTER_X} ${CENTER_Y})`}
            />
            <polyline
              aria-hidden="true"
              className="fill-none transition-opacity motion-reduce:transition-none"
              points={`${segment.leaderAnchorX},${segment.leaderAnchorY} ${segment.side === "left" ? 78 : 182},${segment.labelY} ${segment.leaderEndX},${segment.labelY}`}
              stroke={segment.color}
              strokeWidth={isActive ? 1.75 : 1}
            />
            <text
              aria-hidden="true"
              className={`cursor-pointer text-[7px] ${isActive ? "font-semibold fill-stone-950" : "fill-stone-700"}`}
              dominantBaseline="middle"
              textAnchor={segment.side === "left" ? "end" : "start"}
              x={segment.labelX}
              y={segment.labelY}
            >
              {formatDonutLabel(segment.label)}
            </text>
          </g>
        );
      })}
      <text className="fill-stone-950 font-mono text-[17px] font-semibold tabular-nums" textAnchor="middle" x={CENTER_X} y="83">
        {activeItem ? activeItem.count : total}
      </text>
      <text className="fill-stone-500 font-mono text-[7px] uppercase tracking-wide" textAnchor="middle" x={CENTER_X} y="95">
        {activeItem ? `${Math.round(activeItem.percent)}%` : total > 0 ? "оценок" : "нет оценок"}
      </text>
      {total === 0 ? (
        <text className="fill-stone-500 font-mono text-[7px]" textAnchor="middle" x={CENTER_X} y="157">
          Пока нет оценок
        </text>
      ) : null}
    </svg>
  );
}
