"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRouteTransitionProgress } from "@/components/ui/route-transition-progress";

export function RouteSwitch({ checked, href, label, size = "sm" }: { checked: boolean; href: string; label: string; size?: "sm" | "lg" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return <ToggleSwitch checked={checked} label={label} size={size} pending={pending} onCheckedChange={() => {
    startRouteTransitionProgress();
    startTransition(() => router.push(href, { scroll: false }));
  }} />;
}

export function ToggleSwitch({ checked, label, size = "sm", pending = false, onCheckedChange }: {
  checked: boolean; label: string; size?: "sm" | "lg"; pending?: boolean; onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={pending}
      disabled={pending}
      onClick={() => onCheckedChange(!checked)}
      className={`inline-flex shrink-0 cursor-pointer rounded font-mono uppercase tracking-[0.12em] outline-offset-4 transition-colors hover:text-stone-950 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60 ${size === "lg" ? "h-10 items-center gap-3 text-sm" : "items-baseline gap-1.5 text-[10px]"} ${checked ? "font-bold text-stone-950" : "font-semibold text-stone-500"}`}
    >
      <span aria-hidden="true" className={`flex shrink-0 items-center rounded-full p-0.5 ${size === "lg" ? "h-6 w-11" : "h-4 w-7 self-center"} ${checked ? "bg-stone-800" : "bg-stone-400"}`}>
        <span className={`rounded-full bg-white transition-transform ${size === "lg" ? "size-5" : "size-3"} ${checked ? size === "lg" ? "translate-x-5" : "translate-x-3" : ""}`} />
      </span>
      <span>{label}</span>
    </button>
  );
}
