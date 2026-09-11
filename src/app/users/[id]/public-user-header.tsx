import Link from "next/link";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";

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
  returnTo: string;
  statistics?: readonly { label: string; value: string }[];
};

export function PublicUserHeader({
  currentAdmin,
  currentAuthor,
  profile,
  returnTo,
  statistics = [],
}: PublicUserHeaderProps) {
  const basePath = `/users/${profile.id}`;

  return (
    <header className="archive-paper-surface archive-panel">
      <div className="flex flex-wrap items-center gap-4 p-5 sm:p-7">
        <Link
          href={basePath}
          aria-label={`Открыть профиль ${profile.name}`}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900 focus-visible:ring-offset-2"
        >
          <Avatar name={profile.name} objectKey={profile.avatarObjectKey} className="size-20 text-2xl" />
        </Link>
        <div className="min-w-0 shrink-0">
          <h1 className="break-words font-serif text-3xl sm:text-4xl">{profile.name}</h1>
        </div>
        {statistics.length > 0 ? (
          <dl className="grid min-w-0 flex-1 grid-cols-2 sm:grid-cols-5">
            {statistics.map((statistic, index) => (
              <div
                key={statistic.label}
                className={`flex flex-col px-3 py-1 text-center first:pl-0 sm:px-6 ${index % 2 === 1 ? "border-l border-stone-400/30" : ""} ${index > 0 ? "sm:border-l sm:border-stone-400/30" : ""}`}
              >
                <dt className="order-2 mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">{statistic.label}</dt>
                <dd className="order-1 font-serif text-2xl leading-none tabular-nums text-stone-950">{statistic.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {currentAuthor ? (
          <div className="ml-auto shrink-0">
            <FriendshipControls returnTo={returnTo} state={profile.relationState} targetId={profile.id} />
          </div>
        ) : currentAdmin ? null : (
          <Link href="/author/login" className={`${buttonVariants({ variant: "outline" })} ml-auto shrink-0`}>Войти</Link>
        )}
      </div>
    </header>
  );
}
