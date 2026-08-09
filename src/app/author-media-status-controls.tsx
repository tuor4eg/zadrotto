"use client";

import { useActionState } from "react";
import { EyeOff, Heart } from "lucide-react";

import {
  toggleAuthorMediaStatusAction,
  type ToggleAuthorMediaStatusState,
} from "@/app/media-status/actions";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { cn } from "@/lib/common/utils";
import type { AuthorMediaStatus } from "@/lib/media/author-media-status";

const INITIAL_STATE: ToggleAuthorMediaStatusState = { error: null };

const STATUS_OPTIONS = [
  {
    status: "wanted",
    label: "В желаемое",
    activeLabel: "Убрать из желаемого",
    Icon: Heart,
  },
  {
    status: "skipped",
    label: "Пропустить",
    activeLabel: "Отменить пропуск",
    Icon: EyeOff,
  },
] as const;

export function AuthorMediaStatusControls({
  className,
  currentAuthorScore,
  currentAuthorStatus,
  mediaItemCode,
  variant = "detail",
}: {
  className?: string;
  currentAuthorScore: number | null;
  currentAuthorStatus: AuthorMediaStatus | null;
  mediaItemCode: string;
  variant?: "detail" | "preview" | "tile";
}) {
  const [state, action, pending] = useActionState(toggleAuthorMediaStatusAction, INITIAL_STATE);
  const disabled = currentAuthorScore !== null || pending;

  return (
    <div className={cn(variant === "detail" && "mt-2", variant === "preview" && "w-full", className)}>
      <div className={variant === "preview" ? "grid grid-cols-2 gap-2" : variant === "detail" ? "flex gap-2" : "flex gap-1"}>
        {STATUS_OPTIONS.map(({ status, label, activeLabel, Icon }) => {
          const active = currentAuthorStatus === status;
          const actionLabel = active ? activeLabel : label;
          return (
            <form key={status} action={action} className={variant === "preview" ? "min-w-0" : undefined}>
              <input type="hidden" name="mediaItemCode" value={mediaItemCode} />
              <input type="hidden" name="status" value={status} />
              <ArchiveTooltip className={variant === "preview" ? "w-full" : undefined} label={actionLabel} side="bottom">
                <button
                  type="submit"
                  disabled={disabled}
                  aria-label={actionLabel}
                  aria-pressed={active}
                  className={`inline-flex items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    variant === "preview"
                      ? "h-9 w-full rounded-md"
                      : variant === "detail"
                        ? "size-9 rounded-md"
                      : "size-7 rounded-full shadow-sm backdrop-blur-[1px]"
                  } ${
                    active
                      ? "border-red-900/40 bg-red-900/10 text-red-950"
                      : variant === "detail" || variant === "preview"
                        ? "border-stone-300/80 bg-stone-50/50 text-stone-700 hover:border-stone-700 hover:text-stone-950"
                        : "border-stone-50/40 bg-stone-950/62 text-stone-50 hover:border-stone-50/80 hover:bg-stone-950/80"
                  }`}
                >
                  <Icon className={`${variant === "tile" ? "size-3.5" : "size-4"} ${active ? "fill-current" : ""}`} />
                </button>
              </ArchiveTooltip>
            </form>
          );
        })}
      </div>
      {state.error ? <p className="mt-2 text-xs text-red-900">{state.error}</p> : null}
    </div>
  );
}
