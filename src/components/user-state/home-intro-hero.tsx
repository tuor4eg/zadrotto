import Link from "next/link"

import type { AuthorResearchMessage } from "@/lib/main-page/author-research-message"
import type { HomeHeroStatisticItem } from "@/lib/main-page/home-research-snapshot"

export function HomeIntroHero({
  message,
  statisticItems,
}: {
  message: AuthorResearchMessage
  statisticItems: HomeHeroStatisticItem[]
}) {
  return (
    <div className="w-full lg:max-w-[66%]">
      <h1
        id="main-intro-title"
        className="font-serif text-3xl leading-tight tracking-tight text-stone-950 sm:text-5xl lg:text-6xl"
      >
        {message.title}
      </h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-700 sm:text-lg sm:leading-7">
        {message.body}
      </p>
      <Link
        href={message.cta.href}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-stone-900 px-5 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-50 transition-colors hover:bg-red-950 sm:text-xs"
      >
        {message.cta.label}
      </Link>
      {statisticItems.length > 0 ? (
        <dl className={`mt-5 grid max-w-4xl grid-cols-3 ${statisticItems.length >= 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {statisticItems.map((statistic, index) => (
            <div
              key={statistic.label}
              className={`flex min-w-0 flex-col px-1 py-1 text-center sm:px-6 ${index % 3 !== 0 ? "border-l border-stone-400/30" : ""} ${index > 0 ? "sm:border-l sm:border-stone-400/30" : ""}`}
            >
              <dt className="order-2 mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-stone-600 sm:text-[9px] sm:tracking-[0.12em]">
                {statistic.label}
              </dt>
              <dd className="order-1 font-serif text-lg leading-none tabular-nums text-stone-950 sm:text-2xl">
                {statistic.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
