"use client"

import { useEffect, useMemo, useState } from "react"

import {
  HomeAuthorStatistics,
  type HomeAuthorStatisticsData,
} from "@/app/main/home-author-statistics"
import type { MediaTypeOption } from "@/lib/media/types"
import {
  buildDemoHomeStatistics,
  parseDemoHomeStatisticsMediaItems,
  type DemoHomeStatisticsMediaItem,
} from "@/lib/user-state/demo-home-statistics"
import { useDemoProfile } from "@/lib/user-state/use-demo-profile"

type LoadedDemoMetadata = {
  items: DemoHomeStatisticsMediaItem[]
  ratedCodesKey: string
}

export function HomeAuthorStatisticsWithDemo({
  mediaTypes,
  serverSummary,
}: {
  mediaTypes: readonly MediaTypeOption[]
  serverSummary: HomeAuthorStatisticsData | null
}) {
  const profile = useDemoProfile()
  const [loadedMetadata, setLoadedMetadata] = useState<LoadedDemoMetadata | null>(null)
  const isDemo = serverSummary === null && Boolean(profile && profile.import.importedAt == null)
  const ratedCodesKey = useMemo(
    () => isDemo && profile ? Object.keys(profile.ratings).sort().join("\0") : "",
    [isDemo, profile],
  )

  useEffect(() => {
    if (!isDemo || ratedCodesKey === "") return

    let cancelled = false
    const mediaItemCodes = ratedCodesKey.split("\0")
    void fetch("/api/demo-home-statistics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaItemCodes }),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return
        const items = parseDemoHomeStatisticsMediaItems(await response.json())
        if (!cancelled) setLoadedMetadata({ items, ratedCodesKey })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isDemo, profile, ratedCodesKey])

  const demoSummary = useMemo(() => {
    if (
      !isDemo
      || !profile
      || ratedCodesKey === ""
      || loadedMetadata?.ratedCodesKey !== ratedCodesKey
    ) {
      return null
    }
    return buildDemoHomeStatistics(profile, loadedMetadata.items)
  }, [isDemo, loadedMetadata, profile, ratedCodesKey])

  const summary = serverSummary ?? demoSummary
  if (!summary) return null

  return <HomeAuthorStatistics mediaTypes={mediaTypes} ratingSummary={summary} />
}
