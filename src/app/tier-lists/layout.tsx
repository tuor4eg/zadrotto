import { PublicSiteHeader } from "@/components/archive/public-site-header"
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header"

export const dynamic = "force-dynamic"

export default async function TierListsLayout({ children }: { children: React.ReactNode }) {
  const state = await getPublicSiteHeaderState()

  return (
    <main className="archive-page flex min-h-screen flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...state.headerProps} />
        <div className="flex w-full flex-1">
          <div className="archive-paper archive-panel flex min-h-0 w-full flex-1 flex-col overflow-hidden media-carrier-font-pc-steam [&_*]:[font-family:inherit]">
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}
