"use client"

import { useMemo } from "react"

import type { FirstExperiencedPrecision } from "@/lib/authors/media-experiences"
import type { AuthorMediaStatus } from "@/lib/media/author-media-status"
import { useDemoProfile } from "@/lib/user-state/use-demo-profile"

export function useDemoMediaOverlay(
  mediaItemCode: string,
  serverScore: number | null = null,
  serverStatus: AuthorMediaStatus | null = null,
) {
  const profile = useDemoProfile()
  const isDemo = Boolean(profile && profile.import.importedAt == null)

  return useMemo(() => {
    if (!isDemo || !profile) {
      return {
        isDemo: false,
        score: serverScore,
        status: serverStatus,
        firstExperiencedAt: null as string | null,
        firstExperiencedPrecision: null as FirstExperiencedPrecision | null,
      }
    }

    const rating = profile.ratings[mediaItemCode]
    const status = profile.statuses[mediaItemCode]
    return {
      isDemo: true,
      score: rating?.score ?? null,
      status: rating ? null : (status?.status ?? null),
      firstExperiencedAt: rating?.experience?.experiencedAt ?? null,
      firstExperiencedPrecision: rating?.experience?.precision ?? null,
    }
  }, [isDemo, mediaItemCode, profile, serverScore, serverStatus])
}
