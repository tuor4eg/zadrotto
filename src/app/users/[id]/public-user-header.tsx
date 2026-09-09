import Link from "next/link";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";

type PublicUserHeaderProps = {
  active: "achievements" | "ratings" | "statistics";
  currentAuthor: boolean;
  currentAdmin: boolean;
  profile: {
    avatarObjectKey: string | null;
    canViewJournal: boolean;
    id: number;
    name: string;
    relationState: Parameters<typeof FriendshipControls>[0]["state"];
  };
  returnTo: string;
};

export function PublicUserHeader({
  active,
  currentAdmin,
  currentAuthor,
  profile,
  returnTo,
}: PublicUserHeaderProps) {
  const basePath = `/users/${profile.id}`;

  return (
    <header className="archive-paper-surface archive-panel">
      <div className="flex flex-wrap items-center gap-4 p-5 sm:p-7">
        <Avatar name={profile.name} objectKey={profile.avatarObjectKey} className="size-20 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-serif text-3xl sm:text-4xl">{profile.name}</h1>
        </div>
        {currentAuthor ? (
          <FriendshipControls returnTo={returnTo} state={profile.relationState} targetId={profile.id} />
        ) : currentAdmin ? null : (
          <Link href="/author/login" className={buttonVariants({ variant: "outline" })}>Войти</Link>
        )}
      </div>
      <nav aria-label="Разделы профиля пользователя" className="flex flex-wrap gap-2 border-t border-stone-300/70 px-5 py-3 sm:px-7">
        <Link href={basePath} className={buttonVariants({ variant: active === "statistics" ? "default" : "outline", size: "sm" })}>Статистика</Link>
        {profile.canViewJournal ? (
          <Link href={`${basePath}/ratings`} className={buttonVariants({ variant: active === "ratings" ? "default" : "outline", size: "sm" })}>Оценки</Link>
        ) : null}
        <Link href={`${basePath}/achievements`} className={buttonVariants({ variant: active === "achievements" ? "default" : "outline", size: "sm" })}>Ачивки</Link>
      </nav>
    </header>
  );
}
