"use client"

import type { ReactNode } from "react"

import { HomeIntroHero } from "@/components/user-state/home-intro-hero"
import {
  buildHomeHeroStatisticItems,
  buildHomeResearchSnapshotFromDemo,
  getHomeResearchMessage,
} from "@/lib/main-page/home-research-snapshot"
import { useDemoProfile } from "@/lib/user-state/use-demo-profile"

export function DemoHomeIntro({ fallback }: { fallback: ReactNode }) {
  const profile = useDemoProfile()
  if (!profile || profile.import.importedAt != null) return fallback

  const snapshot = buildHomeResearchSnapshotFromDemo(profile)
  const statisticItems = buildHomeHeroStatisticItems(snapshot)
  if (statisticItems.length === 0) return fallback

  return (
    <HomeIntroHero
      message={getHomeResearchMessage(snapshot)}
      statisticItems={statisticItems}
    />
  )
}
