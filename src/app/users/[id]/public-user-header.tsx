import Link from "next/link";
import { ContactRound, LogOut, UserPlus } from "lucide-react";
import { logoutAuthor } from "@/app/author/actions";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { Button } from "@/components/ui/button";
import { ProfileShareButton } from "./profile-share-button";

import { AuthorLevelProgress } from "@/app/author/(protected)/author-level-progress";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import type { AuthorLevelProgress as AuthorLevelProgressData, PublicAuthorLevel } from "@/db/queries/reputation";

type PublicUserHeaderProps = {
  currentAuthor: boolean;
  currentAdmin: boolean;
  profile: {
    avatarObjectKey: string | null;
    canViewJournal: boolean;
    id: number;
    name: string;
    relationState: Parameters<typeof FriendshipControls>[0]["state"];
  };
  level?: PublicAuthorLevel | null;
  levelProgress?: AuthorLevelProgressData | null;
  returnTo: string;
  showActions?: boolean;
  statistics?: readonly { label: string; value: string }[];
};

export function PublicUserHeader({
  currentAdmin,
  currentAuthor,
  level,
  levelProgress,
  profile,
  returnTo,
  statistics = [],
  showActions = true,
}: PublicUserHeaderProps) {
  const basePath = `/users/${profile.id}`;
  const ownProgress = profile.relationState === "self" ? levelProgress : null;
  const displayLevel = ownProgress
    ? { level: ownProgress.currentLevel, name: ownProgress.currentLevelName }
    : level;
  const xpLabel = ownProgress
    ? ownProgress.nextLevel !== null && ownProgress.nextLevelXp !== null
      ? `${ownProgress.xpTotal} / ${ownProgress.nextLevelXp} XP до уровня ${ownProgress.nextLevel}`
      : `${ownProgress.xpTotal} XP · максимальный уровень`
    : null;

  return (
    <header className="public-profile-content archive-paper-surface archive-panel">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-6 p-5 sm:p-7 lg:flex lg:flex-row lg:items-center lg:gap-4">
        <div className="col-start-1 row-start-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 lg:flex lg:gap-4 lg:shrink-0">
          <Link
            href={basePath}
            aria-label={`Открыть профиль ${profile.name}`}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900 focus-visible:ring-offset-2"
          >
            <Avatar name={profile.name} objectKey={profile.avatarObjectKey} className="size-20 text-2xl" />
          </Link>
          <div className="contents lg:relative lg:block lg:min-w-0">
            <h1 className="min-w-0 break-words font-serif text-3xl sm:text-4xl">{profile.name}</h1>
            {displayLevel ? (
              <p className="col-span-2 mt-3 flex flex-wrap lg:mt-1 items-baseline gap-x-3 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600">
                <span>Уровень {displayLevel.level} · {displayLevel.name}</span>
                {xpLabel ? <span className="tabular-nums">{xpLabel}</span> : null}
              </p>
            ) : null}
            {ownProgress ? (
              <div className="col-span-2 lg:absolute lg:inset-x-0 lg:top-full">
                <AuthorLevelProgress progress={ownProgress} />
              </div>
            ) : null}
          </div>
        </div>
        {statistics.length > 0 ? (
          <dl className="col-span-2 row-start-2 mt-3 grid min-w-0 grid-cols-3 gap-y-3 lg:mt-0 lg:flex-1 lg:grid-cols-5 lg:gap-y-0">
            {statistics.map((statistic, index) => (
              <div
                key={statistic.label}
                className={`flex min-w-0 flex-col px-1 py-1 text-center sm:px-6 lg:py-0 ${index % 3 !== 0 ? "border-l border-stone-400/30" : ""} ${index > 0 ? "lg:border-l lg:border-stone-400/30" : ""}`}
              >
                <dt className="order-2 mt-2 font-mono lg:mt-1 lg:leading-[15px] text-[8px] uppercase tracking-[0.08em] text-stone-600 sm:text-[9px] sm:tracking-[0.12em]">{statistic.label}</dt>
                <dd className="order-1 font-serif lg:translate-y-1 lg:leading-10 text-lg leading-none tabular-nums text-stone-950 sm:text-2xl">{statistic.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div aria-label="Действия профиля" className="col-start-2 row-start-1 flex shrink-0 flex-col items-center justify-center gap-2 self-stretch border-l border-stone-400/30 pl-3 lg:ml-auto lg:pl-7">
          <ProfileShareButton profileId={profile.id} name={profile.name} />
          <ArchiveTooltip label="Карточка — скоро" portal>
            <Button type="button" variant="outline" size="icon" disabled aria-label="Карточка профиля — скоро"><ContactRound /></Button>
          </ArchiveTooltip>
          {profile.relationState === "self" ? (
            <ArchiveTooltip label="Выход" portal>
              <form action={logoutAuthor}><Button type="submit" variant="outline" size="icon" aria-label="Выход"><LogOut /></Button></form>
            </ArchiveTooltip>
          ) : !showActions ? null : currentAuthor ? (
            <FriendshipControls iconOnly returnTo={returnTo} state={profile.relationState} targetId={profile.id} />
          ) : currentAdmin ? null : (
            <Link href="/author/login" className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Войти, чтобы добавить в друзья"><UserPlus /></Link>
          )}
        </div>
      </div>
    </header>
  );
}
