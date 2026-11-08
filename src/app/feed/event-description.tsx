import { AuthorScoreBadge } from "@/components/author-score-badge";
import Link from "next/link";
import type { FeedItem } from "@/lib/feed/model";
import { getFeedEventText } from "./presentation";

export function FeedEventDescription({ item, currentAuthorId }: { item: FeedItem; currentAuthorId?: number }) {
  const { prefix, actorName, suffix } = getFeedEventText(item, currentAuthorId);
  return <>{prefix}{actorName && item.actorId
    ? <Link href={`/users/${item.actorId}`} className="font-semibold underline decoration-stone-400 underline-offset-4 hover:text-stone-950">{actorName}</Link>
    : actorName}{suffix}{item.kind === "rating" ? <> <span className="inline-flex align-middle"><AuthorScoreBadge score={item.score} size="compact" /></span></> : null}</>;
}
