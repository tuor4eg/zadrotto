import type { Metadata } from "next"
import Image from "next/image"

import { AuthorAchievementGallery } from "@/components/achievements/author-achievement-gallery"
import { AuthorAchievementHeroStats } from "@/components/achievements/author-achievement-hero-stats"
import { PublicSiteHeader } from "@/components/archive/public-site-header"
import { DemoAchievementsPage } from "@/components/user-state/demo-achievements-page"
import { getAchievementShowcase } from "@/db/queries/achievements"
import { getAchievementShowcaseStats } from "@/lib/achievements/showcase"
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header"

export const metadata: Metadata = {
  title: "Ачивки",
  description: "Твои ачивки в архиве.",
}

export const dynamic = "force-dynamic"

export default async function AchievementsPage() {
  const headerState = await getPublicSiteHeaderState()
  const author = headerState.author

  if (!author) {
    return <DemoAchievementsPage headerProps={headerState.headerProps} />
  }

  const items = await getAchievementShowcase(author.id)
  const stats = getAchievementShowcaseStats(items)

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
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
        <AuthorAchievementGallery items={items} />
      </div>
    </main>
  )
}
