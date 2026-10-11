import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/common/utils";

export function CarouselArrowButton({ direction, size = "small", className, ...props }: ComponentProps<"button"> & {
  direction: "previous" | "next";
  size?: "small" | "default";
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return <button
    type="button"
    className={cn(
      "grid place-items-center rounded-full border border-stone-950/20 bg-stone-950/40 text-white/90 shadow-sm transition-opacity hover:bg-stone-950/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600 disabled:pointer-events-none",
      size === "small" ? "size-7" : "size-9",
      className,
    )}
    {...props}
  ><Icon className="size-4" aria-hidden="true" /></button>;
}
