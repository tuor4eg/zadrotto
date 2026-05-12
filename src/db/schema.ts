import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { MEDIA_TYPES } from "@/lib/media-types";
import { AUTHOR_PERMISSIONS } from "@/lib/author-permissions";
import { PUBLISHED_PUBLICATION_STATUS, PUBLICATION_STATUSES } from "@/lib/publication-status";

export const mediaTypeEnum = pgEnum("media_type", MEDIA_TYPES);
export const publicationStatusEnum = pgEnum("publication_status", PUBLICATION_STATUSES);
export const authorPermissionEnum = pgEnum("author_permission", AUTHOR_PERMISSIONS);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const franchises = pgTable("franchises", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  description: text("description"),
  ...timestamps(),
});

export const authors = pgTable("authors", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps(),
});

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const authorAccessTokens = pgTable(
  "author_access_tokens",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdByAdminId: integer("created_by_admin_id")
      .notNull()
      .references(() => adminUsers.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("author_access_tokens_author_id_idx").on(table.authorId),
  ],
);

export const authorPermissions = pgTable(
  "author_permissions",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    permission: authorPermissionEnum("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdByAdminId: integer("created_by_admin_id").references(() => adminUsers.id),
  },
  (table) => [
    index("author_permissions_author_id_idx").on(table.authorId),
    unique("author_permissions_author_id_permission_unique").on(table.authorId, table.permission),
  ],
);

export const mediaItems = pgTable(
  "media_items",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    description: text("description"),
    mediaType: mediaTypeEnum("media_type").notNull(),
    franchiseId: integer("franchise_id").references(() => franchises.id),
    releaseYear: integer("release_year"),
    coverUrl: text("cover_url"),
    createdByAuthorId: integer("created_by_author_id").references(() => authors.id),
    publicationStatus: publicationStatusEnum("publication_status")
      .default(PUBLISHED_PUBLICATION_STATUS)
      .notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByAdminId: integer("reviewed_by_admin_id").references(() => adminUsers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    adminNote: text("admin_note"),
    ...timestamps(),
  },
  (table) => [
    index("media_items_publication_status_idx").on(table.publicationStatus),
    index("media_items_media_type_idx").on(table.mediaType),
    index("media_items_release_year_idx").on(table.releaseYear),
    index("media_items_title_idx").on(table.title),
    index("media_items_created_by_author_id_idx").on(table.createdByAuthorId),
    index("media_items_franchise_id_idx").on(table.franchiseId),
  ],
);

export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    score: integer("score").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("ratings_author_id_idx").on(table.authorId),
    unique("ratings_media_item_id_author_id_unique").on(table.mediaItemId, table.authorId),
    check(
      "ratings_score_whole_1_to_10_check",
      sql`${table.score} >= 10 and ${table.score} <= 100 and ${table.score} % 10 = 0`,
    ),
  ],
);

export type Franchise = typeof franchises.$inferSelect;
export type NewFranchise = typeof franchises.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type AuthorAccessToken = typeof authorAccessTokens.$inferSelect;
export type NewAuthorAccessToken = typeof authorAccessTokens.$inferInsert;
export type AuthorPermissionRecord = typeof authorPermissions.$inferSelect;
export type NewAuthorPermissionRecord = typeof authorPermissions.$inferInsert;
export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
