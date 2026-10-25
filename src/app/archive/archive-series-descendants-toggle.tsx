"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRouteTransitionProgress } from "@/components/ui/route-transition-progress";

export function ArchiveSeriesDescendantsToggle({ checked, href }: { checked: boolean; href: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={pending}
      disabled={pending}
      onClick={() => {
        startRouteTransitionProgress();
        startTransition(() => router.push(href, { scroll: false }));
      }}
      className={`inline-flex shrink-0 cursor-pointer items-baseline gap-1.5 rounded font-mono text-[10px] uppercase tracking-[0.12em] outline-offset-4 transition-colors hover:text-stone-950 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60 ${checked ? "font-bold text-stone-950" : "font-semibold text-stone-500"}`}
    >
      <span aria-hidden="true" className={`flex h-4 w-7 shrink-0 self-center items-center rounded-full p-0.5 ${checked ? "bg-stone-800" : "bg-stone-400"}`}>
        <span className={`size-3 rounded-full bg-white transition-transform ${checked ? "translate-x-3" : ""}`} />
      </span>
      <span>Серии внутри</span>
    </button>
  );
}
