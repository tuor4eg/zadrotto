import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AchievementShowcase } from "@/components/achievements/achievement-showcase";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { getAchievementShowcase } from "@/db/queries/achievements";
import { getPublicUserProfile } from "@/db/queries/friends";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";

import { PublicUserHeader } from "../public-user-header";

type PageProps = { params: Promise<{ id: string }> };

function parseId(value: string) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = parseId((await params).id)
  if (!id) return {}
  const [current, admin] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()])
  const profile = await getPublicUserProfile(id, current?.id, Boolean(admin))
  return profile ? { title: `Ачивки — ${profile.name}` } : {}
}

export default async function PublicUserAchievementsPage({ params }: PageProps) {
  const id = parseId((await params).id)
  if (!id) notFound()
  const headerState = await getPublicSiteHeaderState()
  const current = headerState.author
  const isAdmin = headerState.currentAdminUser
  const profile = await getPublicUserProfile(id, current?.id, isAdmin)
  if (!profile) notFound()
  const items = await getAchievementShowcase(profile.id)
  const basePath = `/users/${profile.id}`

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <PublicUserHeader currentAdmin={isAdmin} currentAuthor={Boolean(current)} profile={profile} returnTo={`${basePath}/achievements`} />
        <div className="archive-paper archive-panel flex-1 p-4 sm:p-5">
          <AchievementShowcase items={items} title="Ачивки" emptyText="У этого автора пока нет ачивок." />
        </div>
      </div>
    </main>
  )
}
