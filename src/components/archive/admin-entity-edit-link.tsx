import { Pencil } from "lucide-react";
import Link from "next/link";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { buttonVariants } from "@/components/ui/button";

export function AdminEntityEditLink({
  ariaLabel,
  href,
  tooltipLabel,
  tooltipSide,
}: {
  ariaLabel: string;
  href: string;
  tooltipLabel: string;
  tooltipSide?: "bottom" | "right" | "top";
}) {
  return (
    <ArchiveTooltip label={tooltipLabel} side={tooltipSide}>
      <Link
        href={href}
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label={ariaLabel}
      >
        <Pencil />
      </Link>
    </ArchiveTooltip>
  );
}
