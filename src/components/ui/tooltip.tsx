import { cn } from "@/lib/utils";

type TooltipProps = {
  children: React.ReactNode;
  className?: string;
  label: string;
};

export function Tooltip({ children, className, label }: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-950 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
