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
const friendsPage = read("src/app/author/(protected)/friends/page.tsx");
const settingsPage = read("src/app/author/(protected)/profile/page.tsx");
const authorLayout = read("src/app/author/(protected)/layout.tsx");
const archiveHeader = read("src/components/archive/archive-site-header.tsx");
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
  assert.match(queries, /!author\.isDiscoverable && relationState !== "self" && relationState !== "friends"/);
  assert.match(profilePage, /if \(!profile\) notFound\(\)/);
});

test("friends journal exposes only published records and reviews", () => {
  assert.match(queries, /eq\(mediaItems\.publicationStatus, "published"\)/);
  assert.match(queries, /eq\(contributions\.status, "published"\)/);
  assert.doesNotMatch(profilePage, /adminNote|draft|submitted|rejected/);
  assert.match(profilePage, /profile\.canViewJournal/);
  assert.match(profilePage, /journal === "reviews"/);
  assert.match(profilePage, /MediaItemTile[\s\S]*ratingDisplay="author-only"/);
  assert.match(profilePage, /getPublicRatingJournal/);
  assert.match(profilePage, /parseArchiveCatalogPageSize\(query\.pageSize\)/);
  assert.match(profilePage, /ARCHIVE_CATALOG_GRID_CLASS_NAME/);
  assert.match(profilePage, /AdaptiveArchivePageSizeSync/);
  assert.match(mediaItemTile, /ratingDisplay\?: "default" \| "author-only"/);
  assert.match(mediaItemTile, /shouldShowAuthorOnly \? currentAuthorScore : item\.averageScore/);
  assert.match(queries, /getPublicAuthorStatistics/);
  assert.match(queries, /const ratingFilter = and\([\s\S]*mediaItems\.publicationStatus, "published"/);
  assert.match(queries, /const reviewFilter = and\([\s\S]*contributions\.status, "published"/);
  assert.match(profilePage, />Статистика<[^]*>Оценки<[^]*>Рецензии</);
  assert.match(profilePage, /<AuthorStatistics/);
  assert.doesNotMatch(authorStatistics, /adminNote|draft|submitted|rejected/);
});

test("friends UI contains all MVP lists, actions, setting, and pagination", () => {
  assert.equal(FRIENDS_PAGE_SIZE, 20);
  assert.equal(parseFriendsTab("incoming"), "incoming");
  assert.equal(parseFriendsTab("invalid"), "friends");
  for (const label of ["Друзья", "Входящие", "Исходящие", "Поиск"]) assert.match(friendsPage, new RegExp(label));
  assert.match(friendsPage, /PaginationNav/);
  assert.match(settingsPage, /Показывать меня в поиске пользователей/);
  assert.match(profilePage, /FriendshipControls/);
});

test("incoming requests are badged through the site, profile, and friends navigation", () => {
  assert.match(queries, /getIncomingFriendRequestCount/);
  assert.match(queries, /eq\(authorFriendships\.status, "pending"\)/);
  assert.match(queries, /ne\(authorFriendships\.requestedByAuthorId, authorId\)/);
  assert.match(archiveHeader, /NotificationBadge count=\{incomingFriendRequestCount\}/);
  assert.match(authorLayout, /NotificationBadge count=\{incomingFriendRequestCount\}/);
  assert.match(friendsPage, /item === "incoming"[\s\S]*NotificationBadge/);
});
