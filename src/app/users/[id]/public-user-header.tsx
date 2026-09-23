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
      <div className="flex flex-col items-stretch gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-4 lg:shrink-0">
          <Link
            href={basePath}
            aria-label={`Открыть профиль ${profile.name}`}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900 focus-visible:ring-offset-2"
          >
            <Avatar name={profile.name} objectKey={profile.avatarObjectKey} className="size-20 text-2xl" />
          </Link>
          <h1 className="break-words font-serif text-3xl sm:text-4xl">{profile.name}</h1>
        </div>
        {currentAuthor ? (
          <div className="shrink-0 lg:ml-auto">
            <FriendshipControls returnTo={returnTo} state={profile.relationState} targetId={profile.id} />
          </div>
        ) : currentAdmin ? null : (
          <Link href="/author/login" className={`${buttonVariants({ variant: "outline" })} shrink-0 lg:ml-auto`}>Войти</Link>
        )}
        {statistics.length > 0 ? (
          <dl className="grid min-w-0 grid-cols-3 lg:flex-1 lg:grid-cols-5">
            {statistics.map((statistic, index) => (
              <div
                key={statistic.label}
                className={`flex min-w-0 flex-col px-1 py-1 text-center sm:px-6 ${index % 3 !== 0 ? "border-l border-stone-400/30" : ""} ${index > 0 ? "lg:border-l lg:border-stone-400/30" : ""}`}
              >
                <dt className="order-2 mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-stone-600 sm:text-[9px] sm:tracking-[0.12em]">{statistic.label}</dt>
                <dd className="order-1 font-serif text-lg leading-none tabular-nums text-stone-950 sm:text-2xl">{statistic.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  );
}
