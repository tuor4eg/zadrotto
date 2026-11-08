"use client";

import { useActionState, useState, useTransition } from "react";
import { Heart } from "lucide-react";

import {
  toggleAuthorMediaStatusAction,
  type ToggleAuthorMediaStatusState,
} from "@/app/media-status/actions";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { cn } from "@/lib/common/utils";
import { RATING_PILL_SHADOW_CLASS_NAME, RATING_PILL_TONE_CLASS_NAMES } from "@/lib/ratings/tone";
import type { AuthorMediaStatus } from "@/lib/media/author-media-status";
import { hasDemoRating } from "@/lib/user-state/demo-profile";
import { toggleDemoStatus } from "@/lib/user-state/demo-actions";
import { useDemoMediaOverlay } from "@/lib/user-state/use-demo-media-overlay";
import { useDemoProfile } from "@/lib/user-state/use-demo-profile";

const INITIAL_STATE: ToggleAuthorMediaStatusState = { error: null };

const STATUS_OPTIONS = [
  {
    status: "wanted",
    label: "В желаемое",
    activeLabel: "Убрать из желаемого",
    Icon: Heart,
  },
] as const;

export function AuthorMediaStatusControls({
  className,
  currentAuthorScore,
  currentAuthorHasRating = currentAuthorScore !== null,
  isAuthorized = false,
  currentAuthorStatus,
  mediaItemCode,
  variant = "detail",
}: {
  className?: string;
  currentAuthorScore: number | null;
  currentAuthorHasRating?: boolean;
  isAuthorized?: boolean;
  currentAuthorStatus: AuthorMediaStatus | null;
  mediaItemCode: string;
  variant?: "detail" | "preview" | "tile";
}) {
  const demoProfile = useDemoProfile();
  const isDemo = Boolean(!isAuthorized && demoProfile && demoProfile.import.importedAt == null);
  const overlay = useDemoMediaOverlay(mediaItemCode, currentAuthorScore, currentAuthorStatus);
  const effectiveScore = isDemo ? overlay.score : currentAuthorScore;
  const effectiveStatus = isDemo ? overlay.status : currentAuthorStatus;

  const [state, action, pending] = useActionState(toggleAuthorMediaStatusAction, INITIAL_STATE);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoPending, startDemoTransition] = useTransition();
  const hasRating = isDemo && demoProfile ? hasDemoRating(demoProfile, mediaItemCode) : currentAuthorHasRating;
  const disabled = hasRating || effectiveScore !== null || (isDemo ? demoPending : pending);

  function handleDemoToggle(status: AuthorMediaStatus) {
    startDemoTransition(() => {
      try {
        setDemoError(null);
        toggleDemoStatus(mediaItemCode, status);
      } catch (error) {
        setDemoError(error instanceof Error ? error.message : "Не удалось сохранить статус.");
      }
    });
  }

  return (
    <div className={cn(variant === "detail" && "mt-2", variant === "preview" && "w-14 shrink-0", className)}>
      <div className={variant === "preview" ? "grid grid-cols-1 gap-2" : variant === "detail" ? "flex gap-2" : "flex gap-1"}>
        {STATUS_OPTIONS.map(({ status, label, activeLabel, Icon }) => {
          const active = effectiveStatus === status;
          const actionLabel = active ? activeLabel : label;
          if (isDemo) {
            return (
              <div key={status} className={variant === "preview" ? "min-w-0" : undefined}>
                <ArchiveTooltip className={variant === "preview" ? "w-full" : undefined} label={actionLabel} side="bottom" portal={variant === "tile"} align={variant === "tile" ? "start" : "center"}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={actionLabel}
                    aria-pressed={active}
                    onClick={() => handleDemoToggle(status)}
                    className={`inline-flex items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      variant === "preview"
                        ? "size-14 rounded-md"
                        : variant === "detail"
                          ? "size-9 rounded-md"
                        : "size-7 rounded-full backdrop-blur-[1px]"
                    } ${
                      active
                        ? variant === "tile"
                          ? `${RATING_PILL_SHADOW_CLASS_NAME} border-red-900/30 bg-stone-100/75 text-red-900 [--rating-glow:rgba(127,29,29,0.35)] hover:brightness-125`
                          : "border-red-900/40 bg-red-900/10 text-red-950"
                        : variant === "detail" || variant === "preview"
                          ? "border-stone-300/80 bg-stone-50/50 text-stone-700 hover:border-stone-700 hover:text-stone-950"
                          : `${RATING_PILL_TONE_CLASS_NAMES.empty} ${RATING_PILL_SHADOW_CLASS_NAME} border-[color:var(--rating-author-border)] hover:brightness-125`
                    }`}
                  >
                    <Icon className={`${variant === "tile" ? "size-3.5" : variant === "preview" ? "size-6" : "size-4"} ${active ? "fill-current" : ""}`} />
                  </button>
                </ArchiveTooltip>
              </div>
            );
          }

          return (
            <form key={status} action={action} className={variant === "preview" ? "min-w-0" : undefined}>
              <input type="hidden" name="mediaItemCode" value={mediaItemCode} />
              <input type="hidden" name="status" value={status} />
              <ArchiveTooltip className={variant === "preview" ? "w-full" : undefined} label={actionLabel} side="bottom" portal={variant === "tile"} align={variant === "tile" ? "start" : "center"}>
                <button
                  type="submit"
                  disabled={disabled}
                  aria-label={actionLabel}
                  aria-pressed={active}
                  className={`inline-flex items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    variant === "preview"
                      ? "size-14 rounded-md"
                      : variant === "detail"
                        ? "size-9 rounded-md"
                      : "size-7 rounded-full backdrop-blur-[1px]"
                  } ${
                    active
                      ? variant === "tile"
                          ? `${RATING_PILL_SHADOW_CLASS_NAME} border-red-900/30 bg-stone-100/75 text-red-900 [--rating-glow:rgba(127,29,29,0.35)] hover:brightness-125`
                          : "border-red-900/40 bg-red-900/10 text-red-950"
                      : variant === "detail" || variant === "preview"
                        ? "border-stone-300/80 bg-stone-50/50 text-stone-700 hover:border-stone-700 hover:text-stone-950"
                        : `${RATING_PILL_TONE_CLASS_NAMES.empty} ${RATING_PILL_SHADOW_CLASS_NAME} border-[color:var(--rating-author-border)] hover:brightness-125`
                  }`}
                >
                  <Icon className={`${variant === "tile" ? "size-3.5" : variant === "preview" ? "size-6" : "size-4"} ${active ? "fill-current" : ""}`} />
                </button>
              </ArchiveTooltip>
            </form>
          );
        })}
      </div>
      {(isDemo ? demoError : state.error) ? (
        <p className="mt-2 text-xs text-red-700">{isDemo ? demoError : state.error}</p>
      ) : null}
    </div>
  );
}
