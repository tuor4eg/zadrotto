"use client";

import { cn } from "@/lib/common/utils";
import { createPortal } from "react-dom";
import { useState, type CSSProperties } from "react";

type ArchiveTooltipProps = {
  children: React.ReactNode;
  className?: string;
  label: string;
  portal?: boolean;
  side?: "bottom" | "left" | "right" | "top";
  tooltipClassName?: string;
};

export function ArchiveTooltip({
  children,
  className,
  label,
  portal = false,
  side = "top",
  tooltipClassName,
}: ArchiveTooltipProps) {
  const hasTooltip = Boolean(label);
  const [portalPosition, setPortalPosition] = useState<CSSProperties | null>(null);

  function showPortalTooltip(event: React.MouseEvent<HTMLSpanElement> | React.FocusEvent<HTMLSpanElement>) {
    if (!portal) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setPortalPosition(
      side === "right"
        ? { left: rect.right + 9, top: rect.top + rect.height / 2 }
        : side === "left"
          ? { left: rect.left - 9, top: rect.top + rect.height / 2 }
          : side === "bottom"
            ? { left: rect.left + rect.width / 2, top: rect.bottom + 7 }
            : { left: rect.left + rect.width / 2, top: rect.top - 7 },
    );
  }

  function hidePortalTooltip() {
    if (portal) setPortalPosition(null);
  }

  const tooltip = hasTooltip ? (
    <span
      role="tooltip"
      style={portal ? portalPosition ?? undefined : undefined}
      className={cn(
        "archive-paper-surface pointer-events-none z-[90] hidden whitespace-nowrap rounded-sm border border-stone-500 px-3 py-2 font-mono text-[11px] font-semibold normal-case tracking-[0.04em] text-stone-950 opacity-0 shadow-[0_9px_18px_rgba(28,25,23,0.22)] transition-opacity duration-75 before:absolute before:size-2 before:rotate-45 before:border-stone-500 before:content-[''] group-hover/archive-tooltip:opacity-100 group-focus-within/archive-tooltip:opacity-100 lg:block",
        portal ? "fixed block opacity-100" : "absolute",
        !portal && side === "top"
          ? "left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)]"
          : null,
        !portal && side === "bottom"
          ? "left-1/2 top-full -translate-x-1/2 translate-y-[0.45rem]"
          : null,
        !portal && side === "right"
          ? "left-full top-1/2 translate-x-[0.55rem] -translate-y-1/2"
          : null,
        !portal && side === "left"
          ? "right-full top-1/2 -translate-x-[0.55rem] -translate-y-1/2"
          : null,
        portal && side === "top" ? "-translate-x-1/2 -translate-y-[calc(100%+0.45rem)]" : null,
        portal && side === "bottom" ? "-translate-x-1/2 translate-y-[0.45rem]" : null,
        portal && side === "right" ? "-translate-y-1/2" : null,
        portal && side === "left" ? "-translate-x-full -translate-y-1/2" : null,
        side === "top"
          ? "before:left-1/2 before:top-full before:-translate-x-1/2 before:-translate-y-1/2 before:border-b before:border-r before:bg-[rgb(var(--archive-paper-end))]"
          : null,
        side === "bottom"
          ? "before:bottom-full before:left-1/2 before:-translate-x-1/2 before:translate-y-1/2 before:border-l before:border-t before:bg-[rgb(var(--archive-paper-start))]"
          : null,
        side === "right"
          ? "before:right-full before:top-1/2 before:-translate-y-1/2 before:translate-x-1/2 before:border-b before:border-l before:bg-[rgb(var(--archive-paper-start))]"
          : null,
        side === "left"
          ? "before:left-full before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:border-r before:border-t before:bg-[rgb(var(--archive-paper-start))]"
          : null,
        tooltipClassName,
      )}
    >
      {label}
    </span>
  ) : null;

  return (
    <span
      className={cn(
        "relative inline-flex",
        hasTooltip ? "group/archive-tooltip" : null,
        className,
      )}
      onBlur={hidePortalTooltip}
      onFocus={showPortalTooltip}
      onMouseEnter={showPortalTooltip}
      onMouseLeave={hidePortalTooltip}
    >
      {children}
      {portal ? (portalPosition && typeof document !== "undefined" ? createPortal(tooltip, document.body) : null) : tooltip}
    </span>
  );
}
