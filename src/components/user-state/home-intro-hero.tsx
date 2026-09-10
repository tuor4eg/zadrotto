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
        className="font-serif text-4xl leading-[0.95] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl"
      >
        {message.title}
      </h1>
      <p className="mt-3 max-w-4xl text-base leading-7 text-stone-700 sm:text-lg">
        {message.body}
      </p>
      <Link
        href={message.cta.href}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-stone-900 px-5 font-mono text-xs uppercase tracking-[0.12em] text-stone-50 transition-colors hover:bg-red-950"
      >
        {message.cta.label}
      </Link>
      {statisticItems.length > 0 ? (
        <dl className={`mt-5 grid max-w-4xl grid-cols-2 ${statisticItems.length >= 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {statisticItems.map((statistic, index) => (
            <div
              key={statistic.label}
              className={`flex flex-col px-3 py-1 text-center first:pl-0 sm:px-6 ${index % 2 === 1 ? "border-l border-stone-400/30" : ""} ${index > 0 ? "sm:border-l sm:border-stone-400/30" : ""}`}
            >
              <dt className="order-2 mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">
                {statistic.label}
              </dt>
              <dd className="order-1 font-serif text-2xl leading-none tabular-nums text-stone-950">
                {statistic.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
