import type { FeedItem } from "@/lib/feed/model";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow",
});
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Moscow",
});

export function formatFeedEventDate(at: string) { return dateFormatter.format(new Date(at)); }

export function groupFeedItemsByDay(items: readonly FeedItem[]) {
  const groups = new Map<string, { day: string; label: string; items: FeedItem[] }>();
  for (const item of items) {
    const parts = dayFormatter.formatToParts(new Date(item.cursor.at));
    const day = ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
    let group = groups.get(day);
    if (!group) {
      group = { day, label: formatFeedEventDate(item.cursor.at), items: [] };
      groups.set(day, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

export function getFeedEventText(item: FeedItem, currentAuthorId?: number) {
  const isSelf = currentAuthorId !== undefined && item.actorId === currentAuthorId;
  const actorName = isSelf ? "Вы" : item.actorName;
  let prefix = !isSelf && actorName && item.actorIsFriend ? "Ваш друг " : "";
  let suffix: string;
  switch (item.kind) {
    case "media": suffix = actorName ? (isSelf ? " добавили новую запись" : " добавил новую запись") : "В архив добавлена новая запись"; break;
    case "series": suffix = actorName ? (isSelf ? " добавили новую серию" : " добавил новую серию") : "В архив добавлена новая серия"; break;
    case "review": suffix = `${actorName ? (isSelf ? " добавили рецензию" : " добавил рецензию") : "Добавлена рецензия"}${item.reviewTitle ? ` «${item.reviewTitle}»` : ""}`; break;
    case "collection": return { prefix: "", actorName: null, suffix: "Редакция добавила новую подборку" };
    case "rating": prefix = isSelf ? "" : "Ваш друг "; suffix = ` ${isSelf ? "поставили" : "поставил"} оценку`; break;
    case "achievement": prefix = isSelf ? "" : "Ваш друг "; suffix = isSelf ? " получили ачивку" : " получил ачивку"; break;
    case "wanted": prefix = isSelf ? "" : "Ваш друг "; suffix = isSelf ? " добавили запись в желаемое" : " добавил запись в желаемое"; break;
  }
  return { prefix, actorName, suffix };
}

export function describeFeedEvent(item: FeedItem, currentAuthorId?: number) {
  const { prefix, actorName, suffix } = getFeedEventText(item, currentAuthorId);
  return `${prefix}${actorName ?? ""}${suffix}`;
}
