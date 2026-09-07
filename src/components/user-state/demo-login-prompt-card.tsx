"use client"

import Image from "next/image"
import { useState } from "react"

import { AuthorLoginModal } from "@/app/author/login/author-login-modal"
import { ONBOARDING_IMAGE_SLOT_CLASS_NAME } from "@/components/onboarding/onboarding-hud-card"
import { buttonVariants } from "@/components/ui/button"
import { ARCHIVE_ONBOARDING_IMAGE_SRC } from "@/lib/onboarding/model"
import {
  DEMO_LOGIN_PROMPT_RATING_THRESHOLD,
  getDemoRatingsCount,
  shouldShowDemoLoginPrompt,
} from "@/lib/user-state/demo-profile"
import { dismissDemoLoginPrompt } from "@/lib/user-state/demo-actions"
import { useDemoProfile } from "@/lib/user-state/use-demo-profile"
import { cn } from "@/lib/common/utils"

export function DemoLoginPromptCard({
  onboardingBusy = false,
}: {
  onboardingBusy?: boolean
}) {
  const profile = useDemoProfile()
  const [loginOpen, setLoginOpen] = useState(false)
  const [dismissedInSession, setDismissedInSession] = useState(false)
  const [heldVisible, setHeldVisible] = useState(false)

  const eligible = Boolean(
    profile
    && profile.import.importedAt == null
    && !onboardingBusy
    && !dismissedInSession,
  )
  const shouldOpen = Boolean(eligible && profile && shouldShowDemoLoginPrompt(profile))
  if (shouldOpen && !heldVisible) {
    setHeldVisible(true)
  }
  if (!eligible && heldVisible) {
    setHeldVisible(false)
  }

  if (!eligible || !heldVisible || !profile) return null

  const ratingsCount = getDemoRatingsCount(profile)

  return (
    <>
      <div
        className="archive-paper-surface pointer-events-auto flex w-[min(22rem,calc(100vw-2rem))] items-stretch overflow-hidden rounded-2xl border border-stone-900/15 bg-stone-50/95 shadow-[0_12px_28px_rgba(28,25,23,0.22)] backdrop-blur-sm"
        role="status"
        aria-label="Не потеряй свою историю"
      >
        <div className={ONBOARDING_IMAGE_SLOT_CLASS_NAME} aria-hidden="true">
          <Image
            src={ARCHIVE_ONBOARDING_IMAGE_SRC}
            alt=""
            width={320}
            height={292}
            unoptimized
            className="absolute bottom-0 left-0 h-full w-full object-contain object-bottom object-left"
          />
        </div>
        <div className="min-w-0 flex-1 py-2 pr-2 pl-1.5">
          <p className="font-serif text-lg leading-tight text-stone-950">Не потеряй свою историю</p>
          <p className="mt-1 text-sm leading-5 text-stone-600">
            {ratingsCount} {ratingsCount === 1 ? "оценка сохранена" : "оценок сохранены"} только в этом браузере.
            {ratingsCount >= DEMO_LOGIN_PROMPT_RATING_THRESHOLD
              ? " Войди, чтобы перенести их в аккаунт."
              : null}
          </p>
          <div className="mt-3 flex flex-nowrap items-center gap-1.5">
            <button
              type="button"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 px-2.5 text-xs")}
              onClick={() => {
                dismissDemoLoginPrompt()
                setDismissedInSession(true)
                setHeldVisible(false)
              }}
            >
              Позже
            </button>
            <button
              type="button"
              className={cn(buttonVariants({ size: "sm" }), "h-8 px-2.5 text-xs")}
              onClick={() => setLoginOpen(true)}
            >
              Войти
            </button>
          </div>
        </div>
      </div>
      {loginOpen ? (
        <AuthorLoginModal
          onClose={() => setLoginOpen(false)}
          onSuccess={() => {
            setLoginOpen(false)
            setDismissedInSession(true)
            setHeldVisible(false)
          }}
        />
      ) : null}
    </>
  )
}
