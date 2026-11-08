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
    className="max-w-full"
    triggerClassName="max-w-full"
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
