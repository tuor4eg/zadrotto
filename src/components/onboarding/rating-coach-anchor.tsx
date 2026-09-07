"use client"

import { createPortal } from "react-dom"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { useExternalInterface } from "@/components/external-interface/external-interface-layer"
import { ARCHIVE_ONBOARDING_COACH_MARK_TEXT } from "@/lib/onboarding/model"

type RatingCoachAnchorProps = {
  children: ReactNode
}

export function RatingCoachAnchor({ children }: RatingCoachAnchorProps) {
  const { showRatingCoachMark } = useExternalInterface()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (!showRatingCoachMark) return
    const element = anchorRef.current
    if (!element) return
    const anchorElement = element

    function updateFromAnchor() {
      const rect = anchorElement.getBoundingClientRect()
      const isVisible = rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth

      setBubbleStyle(
        isVisible
          ? {
              left: Math.max(12, rect.left),
              top: Math.max(12, rect.top - 10),
            }
          : null,
      )
    }

    const observer = new IntersectionObserver(() => {
      updateFromAnchor()
    }, { threshold: [0, 0.35, 1] })
    observer.observe(anchorElement)
    window.addEventListener("resize", updateFromAnchor)
    window.addEventListener("scroll", updateFromAnchor, true)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateFromAnchor)
      window.removeEventListener("scroll", updateFromAnchor, true)
    }
  }, [showRatingCoachMark])

  return (
    <div ref={anchorRef} className="relative h-full w-full">
      {children}
      {showRatingCoachMark && bubbleStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[80] max-w-[16rem] -translate-y-full"
              style={bubbleStyle}
              role="note"
            >
              <div className="rounded-md bg-stone-900 px-3 py-2 text-sm leading-5 text-stone-50 shadow-[0_10px_22px_rgba(28,25,23,0.28)]">
                {ARCHIVE_ONBOARDING_COACH_MARK_TEXT}
              </div>
              <span
                aria-hidden="true"
                className="absolute left-6 top-full h-0 w-0 border-x-[7px] border-t-[8px] border-x-transparent border-t-amber-400"
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}