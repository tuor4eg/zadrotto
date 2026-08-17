import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { AchievementShowcase } from "@/components/achievements/achievement-showcase";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { getAchievementShowcase } from "@/db/queries/achievements";
import { getPublicUserProfile } from "@/db/queries/friends";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

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
  const [current, admin] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()])
  const isAdmin = Boolean(admin)
  const profile = await getPublicUserProfile(id, current?.id, isAdmin)
  if (!profile) notFound()
  const items = await getAchievementShowcase(profile.id)
  const basePath = `/users/${profile.id}`

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto w-full max-w-[1480px] space-y-3">
        <nav className="text-sm text-stone-600"><Link href="/" className="underline underline-offset-4">На главную</Link></nav>
        <header className="archive-paper-surface archive-panel">
          <div className="flex flex-wrap items-center gap-4 p-5 sm:p-7">
            <Avatar name={profile.name} objectKey={profile.avatarObjectKey} className="size-20 text-2xl" />
            <div className="min-w-0 flex-1"><h1 className="break-words font-serif text-3xl sm:text-4xl">{profile.name}</h1></div>
            {current ? <FriendshipControls returnTo={`${basePath}/achievements`} state={profile.relationState} targetId={profile.id} /> : isAdmin ? null : <Link href="/author/login" className={buttonVariants({ variant: "outline" })}>Войти</Link>}
          </div>
          <nav aria-label="Разделы профиля пользователя" className="flex flex-wrap gap-2 border-t border-stone-300/70 px-5 py-3 sm:px-7">
            <Link href={basePath} className={buttonVariants({ variant: "outline", size: "sm" })}>Статистика</Link>
            {profile.canViewJournal ? <>
              <Link href={`${basePath}?view=ratings`} className={buttonVariants({ variant: "outline", size: "sm" })}>Оценки</Link>
              <Link href={`${basePath}?view=reviews`} className={buttonVariants({ variant: "outline", size: "sm" })}>Рецензии</Link>
            </> : null}
            <Link href={`${basePath}/achievements`} className={buttonVariants({ size: "sm" })}>Ачивки</Link>
          </nav>
        </header>
        <AchievementShowcase items={items} title="Ачивки" emptyText="У этого автора пока нет ачивок." />
      </div>
    </main>
  )
}
