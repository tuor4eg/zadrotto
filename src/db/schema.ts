import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { MEDIA_TYPES } from "@/lib/media-types";
import { FIRST_EXPERIENCED_PRECISIONS } from "@/lib/author-media-experiences";
import { CONTRIBUTION_STATUSES, CONTRIBUTION_TYPES } from "@/lib/contributions";
import { PUBLISHED_PUBLICATION_STATUS, PUBLICATION_STATUSES } from "@/lib/publication-status";

export const mediaTypeEnum = pgEnum("media_type", MEDIA_TYPES);
export const publicationStatusEnum = pgEnum("publication_status", PUBLICATION_STATUSES);
export const contributionTypeEnum = pgEnum("contribution_type", CONTRIBUTION_TYPES);
export const contributionStatusEnum = pgEnum("contribution_status", CONTRIBUTION_STATUSES);
export const firstExperiencedPrecisionEnum = pgEnum(
  "first_experienced_precision",
  FIRST_EXPERIENCED_PRECISIONS,
);

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

export const authorAccessProfiles = pgTable("author_access_profiles", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  canPublishMediaWithoutReview: boolean("can_publish_media_without_review")
    .default(false)
    .notNull(),
  maxDraftMediaItems: integer("max_draft_media_items"),
  maxDraftMediaItemsPerDay: integer("max_draft_media_items_per_day"),
  maxUploadBytes: integer("max_upload_bytes"),
  maxFilesPerMediaItem: integer("max_files_per_media_item"),
  ...timestamps(),
});

export const authors = pgTable("authors", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  accessProfileId: integer("access_profile_id")
    .notNull()
    .references(() => authorAccessProfiles.id),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockedByAdminId: integer("blocked_by_admin_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  ...timestamps(),
}, (table) => [
  index("authors_access_profile_id_idx").on(table.accessProfileId),
]);

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

export const authorMediaExperiences = pgTable(
  "author_media_experiences",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    firstExperiencedAt: date("first_experienced_at").notNull(),
    firstExperiencedPrecision: firstExperiencedPrecisionEnum(
      "first_experienced_precision",
    ).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("author_media_experiences_author_id_idx").on(table.authorId),
    unique("author_media_experiences_media_item_id_author_id_unique").on(
      table.mediaItemId,
      table.authorId,
    ),
  ],
);

export const contributions = pgTable(
  "contributions",
  {
    id: serial("id").primaryKey(),
    type: contributionTypeEnum("type").notNull(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    primaryMediaItemId: integer("primary_media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    status: contributionStatusEnum("status").default("draft").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByAdminId: integer("reviewed_by_admin_id").references(() => adminUsers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    adminNote: text("admin_note"),
    ...timestamps(),
  },
  (table) => [
    index("contributions_status_submitted_at_idx").on(table.status, table.submittedAt),
    index("contributions_author_id_updated_at_idx").on(table.authorId, table.updatedAt),
    index("contributions_primary_media_item_id_idx").on(table.primaryMediaItemId),
    uniqueIndex("contributions_review_author_media_unique")
      .on(table.authorId, table.primaryMediaItemId)
      .where(sql`${table.type} = 'review'`),
  ],
);

export const contributionReviews = pgTable("contribution_reviews", {
  contributionId: integer("contribution_id")
    .primaryKey()
    .references(() => contributions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
});

export const contributionMediaItems = pgTable(
  "contribution_media_items",
  {
    contributionId: integer("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
  },
  (table) => [
    primaryKey({
      columns: [table.contributionId, table.mediaItemId],
      name: "contribution_media_items_pk",
    }),
    index("contribution_media_items_media_item_id_idx").on(table.mediaItemId),
  ],
);

export type Franchise = typeof franchises.$inferSelect;
export type NewFranchise = typeof franchises.$inferInsert;
export type AuthorAccessProfile = typeof authorAccessProfiles.$inferSelect;
export type NewAuthorAccessProfile = typeof authorAccessProfiles.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type AuthorAccessToken = typeof authorAccessTokens.$inferSelect;
export type NewAuthorAccessToken = typeof authorAccessTokens.$inferInsert;
export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
export type AuthorMediaExperience = typeof authorMediaExperiences.$inferSelect;
export type NewAuthorMediaExperience = typeof authorMediaExperiences.$inferInsert;
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
export type ContributionReview = typeof contributionReviews.$inferSelect;
export type NewContributionReview = typeof contributionReviews.$inferInsert;
export type ContributionMediaItem = typeof contributionMediaItems.$inferSelect;
export type NewContributionMediaItem = typeof contributionMediaItems.$inferInsert;
