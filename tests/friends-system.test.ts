import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FRIENDS_PAGE_SIZE, parseFriendsTab } from "../src/lib/friends/model";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("src/db/schema.ts");
const migration = read("drizzle/0058_author_friendships.sql");
const queries = read("src/db/queries/friends.ts");
const actions = read("src/app/users/actions.ts");
const profilePage = read("src/app/users/[id]/page.tsx");
const ratingsPage = read("src/app/users/[id]/ratings/page.tsx");
const profileHeader = read("src/app/users/[id]/public-user-header.tsx");
const friendsPage = read("src/app/author/(protected)/friends/page.tsx");
const settingsPage = read("src/app/author/(protected)/profile/page.tsx");
const authorLayout = read("src/app/author/(protected)/layout.tsx");
const publicHeader = read("src/components/archive/public-site-header.tsx");
const mediaItemTile = read("src/app/media-item-tile.tsx");
const authorStatistics = read("src/components/author/author-statistics.tsx");

test("friendship persistence enforces a canonical unique pair", () => {
  assert.match(schema, /isDiscoverable: boolean\("is_discoverable"\)\.default\(true\)\.notNull\(\)/);
  assert.match(schema, /unique\("author_friendships_pair_unique"\)/);
  assert.match(schema, /author_friendships_canonical_pair_check/);
  assert.match(schema, /author_friendships_requester_member_check/);
  assert.match(schema, /author_friendships_accepted_at_check/);
  assert.match(migration, /ADD COLUMN "is_discoverable" boolean DEFAULT true NOT NULL/);
  assert.match(migration, /ON DELETE cascade/);
  assert.match(migration, /authors_name_search_idx/);
});

test("friendship transitions are directional and reject duplicate pairs", () => {
  assert.match(queries, /if \(authorId === targetAuthorId\) return "conflict"/);
  assert.match(queries, /onConflictDoNothing/);
  assert.match(queries, /eq\(authorFriendships\.requestedByAuthorId, authorId\)/);
  assert.match(queries, /eq\(authorFriendships\.requestedByAuthorId, requesterId\)/);
  assert.match(queries, /eq\(authorFriendships\.status, "accepted"\)/);
  assert.match(actions, /revalidatePath\(`\/users\/\$\{authorId\}`\)/);
  assert.match(actions, /revalidatePath\(`\/users\/\$\{targetId\}`\)/);
});

test("hidden users are excluded from search and protected on direct access", () => {
  assert.match(queries, /eq\(authors\.isDiscoverable, true\)/);
  assert.match(queries, /containsNormalizedSearchSql\(authors\.name, normalizedQuery\)/);
  assert.match(queries, /eq\(authors\.isSystem, false\)/);
  assert.match(queries, /isNull\(authors\.blockedAt\)/);
  assert.match(queries, /!author\.isDiscoverable && relationState !== "self" && relationState !== "friends" && !isAdmin/);
  assert.match(queries, /canViewJournal: relationState === "self" \|\| relationState === "friends" \|\| isAdmin/);
  assert.match(profilePage, /if \(!profile\) notFound\(\)/);
});

test("friends journal exposes ratings on a dedicated paginated route", () => {
  assert.match(queries, /eq\(mediaItems\.publicationStatus, "published"\)/);
  assert.match(queries, /eq\(contributions\.status, "published"\)/);
  assert.doesNotMatch(profilePage + ratingsPage, /adminNote|draft|submitted|rejected/);
  assert.match(profilePage, /profile\.canViewJournal/);
  assert.doesNotMatch(profilePage, /view === "reviews"|getPublicReviewJournal|view=reviews/);
  assert.doesNotMatch(profilePage, /getPublicRatingJournal|query\.pageSize|view=ratings/);
  assert.match(ratingsPage, /ratingDisplay="author-only"/);
  assert.match(ratingsPage, /getPublicRatingJournal/);
  assert.match(ratingsPage, /parsePageSize\([\s\S]*RATING_PAGE_SIZE_OPTIONS/);
  assert.match(ratingsPage, /pageSizeOptions=\{RATING_PAGE_SIZE_OPTIONS\}/);
  assert.match(ratingsPage, /basePath=\{ratingsPath\}/);
  assert.match(ratingsPage, /grid-cols-3[\s\S]*sm:grid-cols-4[\s\S]*md:grid-cols-5[\s\S]*lg:grid-cols-7[\s\S]*xl:grid-cols-9/);
  assert.match(mediaItemTile, /ratingDisplay\?: "default" \| "author-only"/);
  assert.match(mediaItemTile, /shouldShowAuthorOnly \? currentAuthorScore : item\.averageScore/);
  assert.match(queries, /getPublicAuthorStatistics/);
  assert.match(queries, /const ratingFilter = and\([\s\S]*mediaItems\.publicationStatus, "published"/);
  assert.match(queries, /const reviewFilter = and\([\s\S]*contributions\.status, "published"/);
  assert.match(profileHeader, /href=\{`\$\{basePath\}\/ratings`\}[\s\S]*>Оценки<\/Link>/);
  assert.doesNotMatch(profileHeader, />Рецензии<\/Link>/);
  assert.match(profilePage, /<AuthorStatistics/);
  assert.match(profilePage, /reviewsHref=\{`\/reviews\?author=\$\{profile\.id\}`\}/);
  assert.doesNotMatch(authorStatistics, /adminNote|draft|submitted|rejected/);
  assert.match(ratingsPage, /getCurrentAdminUser/);
  assert.match(profilePage, /getPublicUserProfile\(id, current\?\.id, isAdmin\)/);
  assert.match(ratingsPage, /isAdmin[\s\S]*getAllMediaTypeOptions\(\)/);
  assert.match(profileHeader, /currentAuthor \? \([\s\S]*<FriendshipControls[\s\S]*currentAdmin \? null/);
});

test("friends UI contains all MVP lists, actions, setting, and pagination", () => {
  assert.equal(FRIENDS_PAGE_SIZE, 20);
  assert.equal(parseFriendsTab("incoming"), "incoming");
  assert.equal(parseFriendsTab("invalid"), "friends");
  for (const label of ["Друзья", "Входящие", "Исходящие", "Поиск"]) assert.match(friendsPage, new RegExp(label));
  assert.match(friendsPage, /PaginationNav/);
  assert.match(settingsPage, /Показывать меня в поиске пользователей/);
  assert.match(profileHeader, /FriendshipControls/);
});

test("incoming requests are badged through the site, profile, and friends navigation", () => {
  assert.match(queries, /getIncomingFriendRequestCount/);
  assert.match(queries, /eq\(authorFriendships\.status, "pending"\)/);
  assert.match(queries, /ne\(authorFriendships\.requestedByAuthorId, authorId\)/);
  assert.match(publicHeader, /<NotificationBell align="right" round \/>/);
  assert.match(authorLayout, /NotificationBadge count=\{incomingFriendRequestCount\}/);
  assert.match(friendsPage, /item === "incoming"[\s\S]*NotificationBadge/);
});
