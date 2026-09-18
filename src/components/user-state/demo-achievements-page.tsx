"use client"

import Image from "next/image"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"

import { AuthorAchievementHeroStats } from "@/components/achievements/author-achievement-hero-stats"
import { AuthorAchievementsCatalog } from "@/components/achievements/author-achievements-catalog"
import { FeaturedAchievementShowcase } from "@/components/achievements/featured-achievement-showcase"
import {
  PublicSiteHeader,
  type PublicSiteHeaderProps,
} from "@/components/archive/public-site-header"
import { getAchievementShowcaseStats } from "@/lib/achievements/showcase"
import {
  buildDemoAchievementShowcaseItems,
  type DemoAchievementCatalogItem,
} from "@/lib/user-state/demo-achievements"
import { useDemoProfile } from "@/lib/user-state/use-demo-profile"

type DemoAchievementState = {
  achievements: DemoAchievementCatalogItem[]
  defaultShowcaseBackgroundImageUrl: string | null
  values: Record<string, number>
}

const subscribeToHydration = () => () => {}

export function DemoAchievementsPage({
  headerProps,
}: {
  headerProps: PublicSiteHeaderProps
}) {
  const router = useRouter()
  const profile = useDemoProfile()
  const [state, setState] = useState<DemoAchievementState | null>(null)
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false)
  const isDemo = Boolean(profile && profile.import.importedAt == null)
  const ratedCodesKey = profile
    ? Object.keys(profile.ratings).sort().join("\0")
    : ""

  useEffect(() => {
    if (!ready) return
    if (!isDemo) {
      router.replace("/")
    }
  }, [isDemo, ready, router])

  useEffect(() => {
    if (!isDemo || !profile) return
    let cancelled = false
    const mediaItemCodes = Object.keys(profile.ratings)
    void fetch("/api/demo-achievements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaItemCodes }),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json() as {
          achievements?: DemoAchievementCatalogItem[]
          defaultShowcaseBackgroundImageUrl?: string | null
          values?: Record<string, number>
        }
        if (!cancelled) {
          setState({
            achievements: data.achievements ?? [],
            defaultShowcaseBackgroundImageUrl: data.defaultShowcaseBackgroundImageUrl ?? null,
            values: data.values ?? {},
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            achievements: [],
            defaultShowcaseBackgroundImageUrl: null,
            values: {},
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [isDemo, profile, ratedCodesKey])

  const items = useMemo(() => {
    if (!profile || !isDemo || state == null) return []
    return buildDemoAchievementShowcaseItems(
      state.achievements,
      state.values,
      profile.createdAt,
    )
  }, [isDemo, profile, state])

  const stats = getAchievementShowcaseStats(items)

  if (!ready || !isDemo) {
    return (
      <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
        <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
          <PublicSiteHeader {...headerProps} />
        </div>
      </main>
    )
  }

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerProps} />
        <section
          className="archive-paper archive-panel overflow-hidden px-2 py-6 sm:px-10 lg:px-14 lg:py-7"
          aria-labelledby="achievements-hero-title"
        >
          <Image
            src="/mascot/deadz_achieves.webp"
            alt=""
            fill
            sizes="(max-width: 639px) 100vw, 1px"
            className="object-cover object-right sm:hidden"
            style={{ opacity: 0.25 }}
          />
          <div
            aria-hidden="true"
            className="hidden sm:block"
            style={{
              aspectRatio: "900 / 409",
              backgroundImage: "url('/mascot/deadz_achieves.webp')",
              backgroundPosition: "right center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "auto 100%",
              height: "100%",
              maskImage: "linear-gradient(to right, transparent, black 18%)",
              pointerEvents: "none",
              position: "absolute",
              right: 0,
              top: 0,
              WebkitMaskImage: "linear-gradient(to right, transparent, black 18%)",
              zIndex: 0,
            }}
          />
          <div className="relative z-10">
          <h1
            id="achievements-hero-title"
            className="font-serif text-4xl leading-[0.95] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl"
          >
            Твои ачивки
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-stone-700 sm:text-lg">
            Маленькие победы. Большая история
          </p>
          <AuthorAchievementHeroStats
            completedCount={stats.completedCount}
            earnedCount={stats.earnedCount}
            inProgressCount={stats.inProgressCount}
          />
          </div>
        </section>
        {state == null ? (
          <section className="archive-paper archive-panel flex flex-1 flex-col px-6 py-6 sm:px-10 lg:px-14 lg:py-7">
            <p className="text-sm text-stone-600">Загружаем ачивки…</p>
          </section>
        ) : (
          <>
            <FeaturedAchievementShowcase
              defaultShowcaseBackgroundImageUrl={state.defaultShowcaseBackgroundImageUrl}
              items={items}
            />
            <AuthorAchievementsCatalog items={items} />
          </>
        )}
      </div>
    </main>
  )
}
