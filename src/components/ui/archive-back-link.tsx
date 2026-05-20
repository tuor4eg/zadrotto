import Link from "next/link";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { cn } from "@/lib/utils";

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
        "!absolute left-[-4rem] top-7 h-20 w-16",
        className,
      )}
      side="top"
    >
      <Link
        href={href}
        className="relative -z-20 grid h-full w-full place-items-center rounded-l-md bg-stone-200 text-stone-800 shadow-[0_10px_18px_rgba(28,25,23,0.16)] transition-colors hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
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
