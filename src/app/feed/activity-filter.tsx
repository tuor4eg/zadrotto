"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveSelect } from "@/components/ui/archive-select";
import { startRouteTransitionProgress } from "@/components/ui/route-transition-progress";

export function FeedActivityFilter({ friends, value }: {
  friends: { id: number; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return <ArchiveSelect
    ariaLabel="Активность в ленте"
    value={value}
    className="min-w-0 max-sm:flex-1 sm:w-48"
    triggerClassName="w-full min-w-0 justify-start gap-1.5 px-2 text-left sm:gap-2 sm:px-3"
    menuClassName="p-2"
    options={[
      { value: "all", label: "Вся активность" },
      { value: "mine", label: "Моя активность" },
      ...(friends.length > 0 ? [{ value: "friends", label: "Друзья" }] : []),
      ...friends.map(friend => ({ value: String(friend.id), label: friend.name, indent: true })),
    ]}
    onChange={next => {
      const href = next === "all" ? "/feed" : next === "mine" ? "/feed?mine=1" : next === "friends" ? "/feed?friends=1" : `/feed?friend=${next}`;
      startRouteTransitionProgress();
      startTransition(() => router.push(href, { scroll: false }));
    }}
  />;
}
