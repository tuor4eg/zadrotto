import Link from "next/link";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { cn } from "@/lib/common/utils";

type ArchiveBackLinkProps = {
  className?: string;
  href: string;
  label: string;
  tooltipLabel?: string;
};

export function ArchiveBackLink({
  className,
  href,
  label,
  tooltipLabel = "Назад",
}: ArchiveBackLinkProps) {
  return (
    <ArchiveTooltip
      label={tooltipLabel}
      className={cn(
        "!absolute left-3 top-0 h-11 w-11 -translate-y-1/2 sm:left-[-4rem] sm:top-7 sm:h-20 sm:w-16 sm:translate-y-0",
        className,
      )}
      side="top"
    >
      <Link
        href={href}
        className="relative z-10 grid h-full w-full place-items-center rounded-md bg-stone-200 text-stone-800 shadow-[0_10px_18px_rgba(28,25,23,0.16)] transition-colors hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 sm:-z-20 sm:rounded-l-md"
        aria-label={label}
      >
        <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 32 32">
          <path
            d="M21 7 10 16l11 9"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        </svg>
      </Link>
    </ArchiveTooltip>
  );
}
