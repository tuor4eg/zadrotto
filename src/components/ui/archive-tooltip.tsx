import { cn } from "@/lib/common/utils";

type ArchiveTooltipProps = {
  children: React.ReactNode;
  className?: string;
  label: string;
  side?: "bottom" | "right" | "top";
  tooltipClassName?: string;
};

export function ArchiveTooltip({
  children,
  className,
  label,
  side = "top",
  tooltipClassName,
}: ArchiveTooltipProps) {
  const hasTooltip = Boolean(label);

  return (
    <span
      className={cn(
        "relative inline-flex",
        hasTooltip ? "group/archive-tooltip" : null,
        className,
      )}
    >
      {children}
      {hasTooltip ? (
        <span
          role="tooltip"
          className={cn(
            "archive-paper-surface pointer-events-none absolute z-[90] hidden whitespace-nowrap rounded-sm border border-stone-500 px-3 py-2 font-mono text-[11px] font-semibold normal-case tracking-[0.04em] text-stone-950 opacity-0 shadow-[0_9px_18px_rgba(28,25,23,0.22)] transition-opacity duration-75 before:absolute before:size-2 before:rotate-45 before:border-stone-500 before:content-[''] group-hover/archive-tooltip:opacity-100 group-focus-within/archive-tooltip:opacity-100 lg:block",
            side === "top"
              ? "left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] before:left-1/2 before:top-full before:-translate-x-1/2 before:-translate-y-1/2 before:border-b before:border-r before:bg-[rgb(var(--archive-paper-end))]"
              : null,
            side === "bottom"
              ? "left-1/2 top-full -translate-x-1/2 translate-y-[0.45rem] before:bottom-full before:left-1/2 before:-translate-x-1/2 before:translate-y-1/2 before:border-l before:border-t before:bg-[rgb(var(--archive-paper-start))]"
              : null,
            side === "right"
              ? "left-full top-1/2 translate-x-[0.55rem] -translate-y-1/2 before:right-full before:top-1/2 before:-translate-y-1/2 before:translate-x-1/2 before:border-b before:border-l before:bg-[rgb(var(--archive-paper-start))]"
              : null,
            tooltipClassName,
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
