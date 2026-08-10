export const FRIENDS_PAGE_SIZE = 20;

export const FRIENDSHIP_STATUSES = ["pending", "accepted"] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

export type FriendshipViewState =
  | "self"
  | "none"
  | "outgoing"
  | "incoming"
  | "friends";

export const FRIENDS_TABS = ["friends", "incoming", "outgoing", "search"] as const;
export type FriendsTab = (typeof FRIENDS_TABS)[number];

export function parseFriendsTab(value: string | undefined): FriendsTab {
  return FRIENDS_TABS.includes(value as FriendsTab) ? (value as FriendsTab) : "friends";
}
