import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ChevronDown, ChevronUp, X } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import type { ArchiveOnboardingCard } from "@/lib/onboarding/model"
import { cn } from "@/lib/common/utils"

export const ONBOARDING_IMAGE_SLOT_CLASS_NAME =
  "pointer-events-none relative w-[5.25rem] shrink-0 self-stretch overflow-hidden"

type OnboardingHudCardProps = {
  archiveHref?: string | null
  card: ArchiveOnboardingCard
  collapsed: boolean
  onAcknowledge: () => void
  onDismiss: () => void
  onExpand: () => void
  onNeverShow: () => void
}

export function OnboardingHudCard({
  archiveHref = null,
  card,
  collapsed,
  onAcknowledge,
  onDismiss,
  onExpand,
  onNeverShow,
}: OnboardingHudCardProps) {
  const progressLabel = `${card.ratingsCount}/${card.goalCount}`
  const showProgress = card.stepId !== "start" || !archiveHref
  const showActions = !collapsed
  const showAdvance = showActions && card.stepId === "achievement"
  const showNeverShow = showActions && card.stepId !== "complete" && card.stepId !== "achievement"
  const showArchiveLink = Boolean(archiveHref) && showActions && !showAdvance

  return (
    <div
      className="archive-paper-surface pointer-events-auto relative flex w-[min(24rem,calc(100vw-2rem))] items-stretch overflow-hidden rounded-2xl border border-stone-900/15 bg-stone-50/95 shadow-[0_12px_28px_rgba(28,25,23,0.22)] backdrop-blur-sm"
      role="status"
      aria-label={showProgress ? `${card.title}. ${progressLabel}` : card.title}
    >
      {card.imageSrc ? (
        <div className={ONBOARDING_IMAGE_SLOT_CLASS_NAME} aria-hidden="true">
          <Image
            src={card.imageSrc}
            alt=""
            width={320}
            height={292}
            unoptimized
            className="absolute bottom-0 left-0 h-full w-full object-contain object-bottom object-left"
          />
        </div>
      ) : null}
      <div className="relative z-10 flex min-w-0 flex-1 items-start gap-1 py-2 pr-2 pl-1.5">
        <div className="min-w-0 flex-1">
          {collapsed ? null : (
            <>
              <p className="font-serif text-lg leading-tight text-stone-950">{card.title}</p>
              <p className="mt-0.5 text-sm leading-5 text-stone-600">{card.body}</p>
            </>
          )}
          {showProgress ? (
            <div className={`flex items-center gap-2 ${collapsed ? "" : "mt-1.5"}`}>
              <span className="font-mono text-[11px] font-semibold tabular-nums text-stone-500">
                {progressLabel}
              </span>
              <ol className="flex items-center gap-1.5" aria-hidden="true">
                {Array.from({ length: card.goalCount }, (_, index) => (
                  <li
                    key={index}
                    className={
                      index < card.ratingsCount
                        ? "size-2.5 rounded-full bg-teal-700"
                        : "size-2.5 rounded-full border border-stone-400 bg-transparent"
                    }
                  />
                ))}
              </ol>
            </div>
          ) : null}
          {showActions && (showNeverShow || showArchiveLink || showAdvance) ? (
            <div className="mt-2 flex flex-nowrap items-center gap-1.5">
              {showNeverShow ? (
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ size: "sm", variant: "outline" }),
                    "h-8 shrink px-2.5 text-xs",
                  )}
                  onClick={onNeverShow}
                >
                  Больше не показывать
                </button>
              ) : null}
              {showAdvance ? (
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ size: "icon" }),
                    "size-8 shrink-0 rounded-full",
                  )}
                  aria-label="Дальше"
                  onClick={onAcknowledge}
                >
                  <ArrowRight className="size-4" />
                </button>
              ) : null}
              {showArchiveLink && archiveHref ? (
                <Link
                  href={archiveHref}
                  className={cn(
                    buttonVariants({ size: "icon" }),
                    "size-8 shrink-0 rounded-full",
                  )}
                  aria-label="Поехали в архив"
                >
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {card.canHide ? (
            collapsed ? (
              <button
                type="button"
                className="grid size-6 place-items-center rounded-full text-stone-500 transition-colors hover:bg-stone-200/80 hover:text-stone-950"
                aria-label="Развернуть"
                onClick={onExpand}
              >
                <ChevronDown className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                className="grid size-6 place-items-center rounded-full text-stone-500 transition-colors hover:bg-stone-200/80 hover:text-stone-950"
                aria-label="Свернуть"
                onClick={onAcknowledge}
              >
                <ChevronUp className="size-3.5" />
              </button>
            )
          ) : null}
          <button
            type="button"
            className="grid size-6 place-items-center rounded-full text-stone-500 transition-colors hover:bg-stone-200/80 hover:text-stone-950"
            aria-label="Скрыть подсказку"
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
