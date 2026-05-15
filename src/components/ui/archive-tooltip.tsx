import { cn } from "@/lib/utils";

type ArchiveTooltipProps = {
  children: React.ReactNode;
  className?: string;
  label: string;
  side?: "bottom" | "top";
  tooltipClassName?: string;
};

export function ArchiveTooltip({
  children,
  className,
  label,
  side = "top",
  tooltipClassName,
}: ArchiveTooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "archive-paper-surface pointer-events-none absolute left-1/2 z-[90] hidden -translate-x-1/2 whitespace-nowrap rounded-sm border border-stone-500 px-3 py-2 font-mono text-[11px] font-semibold normal-case tracking-[0.04em] text-stone-950 opacity-0 shadow-[0_9px_18px_rgba(28,25,23,0.22)] transition-opacity duration-75 before:absolute before:left-1/2 before:size-2 before:-translate-x-1/2 before:rotate-45 before:border-stone-500 before:content-[''] group-hover:opacity-100 group-focus-within:opacity-100 lg:block",
          side === "top"
            ? "top-0 -translate-y-[calc(100%+0.45rem)] before:top-full before:-translate-y-1/2 before:border-b before:border-r before:bg-[rgb(var(--archive-paper-end))]"
            : "top-full translate-y-[0.45rem] before:bottom-full before:translate-y-1/2 before:border-l before:border-t before:bg-[rgb(var(--archive-paper-start))]",
          tooltipClassName,
        )}
      >
        {label}
      </span>
    </span>
  );
}
