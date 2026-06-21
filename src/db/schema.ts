import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { FIRST_EXPERIENCED_PRECISIONS } from "@/lib/authors/media-experiences";
import { CONTRIBUTION_STATUSES, CONTRIBUTION_TYPES } from "@/lib/contributions/model";
import { PUBLISHED_PUBLICATION_STATUS, PUBLICATION_STATUSES } from "@/lib/media/publication-status";

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

export const mediaTypes = pgTable("media_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
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
  coverSearchesPerMinute: integer("cover_searches_per_minute"),
  coverSearchesPerHour: integer("cover_searches_per_hour"),
  coverSearchesPerDay: integer("cover_searches_per_day"),
  ...timestamps(),
});

export const coverSettings = pgTable(
  "cover_settings",
  {
    id: integer("id").primaryKey().default(1),
    candidateLimit: integer("candidate_limit").default(8).notNull(),
    tmdbResultScanLimit: integer("tmdb_result_scan_limit").default(3).notNull(),
    coverMaxBytes: integer("cover_max_bytes").default(5242880).notNull(),
    ...timestamps(),
  },
  (table) => [
    check("cover_settings_singleton_id_check", sql`${table.id} = 1`),
    check("cover_settings_candidate_limit_check", sql`${table.candidateLimit} >= 1`),
    check("cover_settings_tmdb_scan_limit_check", sql`${table.tmdbResultScanLimit} >= 1`),
    check("cover_settings_cover_max_bytes_check", sql`${table.coverMaxBytes} >= 1`),
  ],
);

export const coverProviderSettings = pgTable(
  "cover_provider_settings",
  {
    mediaType: text("media_type")
      .notNull()
      .references(() => mediaTypes.code),
    providerCode: text("provider_code").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    priority: integer("priority").default(100).notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.mediaType, table.providerCode],
      name: "cover_provider_settings_pk",
    }),
    check("cover_provider_settings_priority_check", sql`${table.priority} >= 1`),
  ],
);

export const coverProviderCredentials = pgTable("cover_provider_credentials", {
  providerCode: text("provider_code").primaryKey(),
  encryptedPayload: text("encrypted_payload").notNull(),
  keyHint: text("key_hint").notNull(),
  updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  ...timestamps(),
});

export const coverProviderRateLimits = pgTable(
  "cover_provider_rate_limits",
  {
    providerCode: text("provider_code").primaryKey(),
    searchesPerDay: integer("searches_per_day").default(1000).notNull(),
    ...timestamps(),
  },
  (table) => [
    check("cover_provider_rate_limits_searches_per_day_check", sql`${table.searchesPerDay} >= 1`),
  ],
);

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
  sessionInvalidatedAt: timestamp("session_invalidated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  ...timestamps(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const adminActivityLogs = pgTable(
  "admin_activity_logs",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    actorType: text("actor_type").notNull(),
    adminUserId: integer("admin_user_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    authorId: integer("author_id").references(() => authors.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    entityLabel: text("entity_label"),
    status: text("status").notNull(),
    severity: text("severity").default("info").notNull(),
    message: text("message"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index("admin_activity_logs_created_at_idx").on(table.createdAt),
    index("admin_activity_logs_actor_admin_idx").on(table.actorType, table.adminUserId),
    index("admin_activity_logs_actor_author_idx").on(table.actorType, table.authorId),
    index("admin_activity_logs_entity_idx").on(table.entityType, table.entityId),
    index("admin_activity_logs_action_idx").on(table.action),
    index("admin_activity_logs_severity_idx").on(table.severity),
    check(
      "admin_activity_logs_severity_check",
      sql`${table.severity} in ('info', 'warning', 'critical')`,
    ),
  ],
);

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

export const mediaCarriers = pgTable(
  "media_carriers",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps(),
  },
);

export const mediaCarrierMediaTypes = pgTable(
  "media_carrier_media_types",
  {
    mediaCarrierId: integer("media_carrier_id")
      .notNull()
      .references(() => mediaCarriers.id, { onDelete: "cascade" }),
    mediaType: text("media_type")
      .notNull()
      .references(() => mediaTypes.code),
  },
  (table) => [
    primaryKey({
      columns: [table.mediaCarrierId, table.mediaType],
      name: "media_carrier_media_types_pk",
    }),
    index("media_carrier_media_types_media_type_idx").on(table.mediaType),
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
    mediaType: text("media_type")
      .notNull()
      .references(() => mediaTypes.code),
    franchiseId: integer("franchise_id").references(() => franchises.id),
    mediaCarrierId: integer("media_carrier_id").references(() => mediaCarriers.id),
    releaseYear: integer("release_year"),
    coverUrl: text("cover_url"),
    coverThumbUrl: text("cover_thumb_url"),
    coverSourceProvider: text("cover_source_provider"),
    coverSourceExternalId: text("cover_source_external_id"),
    coverSourcePageUrl: text("cover_source_page_url"),
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
    index("media_items_media_carrier_id_idx").on(table.mediaCarrierId),
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
export type CoverSettings = typeof coverSettings.$inferSelect;
export type NewCoverSettings = typeof coverSettings.$inferInsert;
export type CoverProviderSettings = typeof coverProviderSettings.$inferSelect;
export type NewCoverProviderSettings = typeof coverProviderSettings.$inferInsert;
export type CoverProviderCredentials = typeof coverProviderCredentials.$inferSelect;
export type NewCoverProviderCredentials = typeof coverProviderCredentials.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
export type AdminActivityLog = typeof adminActivityLogs.$inferSelect;
export type NewAdminActivityLog = typeof adminActivityLogs.$inferInsert;
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
