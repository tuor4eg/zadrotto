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
  createdByAuthorId: integer("created_by_author_id").references(() => authors.id, {
    onDelete: "set null",
  }),
  publicationStatus: publicationStatusEnum("publication_status")
    .default(PUBLISHED_PUBLICATION_STATUS)
    .notNull(),
  ...timestamps(),
}, (table) => [
  index("franchises_created_by_author_id_idx").on(table.createdByAuthorId),
  index("franchises_publication_status_idx").on(table.publicationStatus),
]);

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
  canPublishFranchisesWithoutReview: boolean("can_publish_franchises_without_review")
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

export const authorRegistrationSettings = pgTable(
  "author_registration_settings",
  {
    id: integer("id").primaryKey().default(1),
    accessProfileId: integer("access_profile_id").references(() => authorAccessProfiles.id, {
      onDelete: "restrict",
    }),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check("author_registration_settings_singleton_id_check", sql`${table.id} = 1`),
  ],
);

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

export const providerSettings = pgTable(
  "provider_settings",
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
      name: "provider_settings_pk",
    }),
    check("provider_settings_priority_check", sql`${table.priority} >= 1`),
  ],
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    providerCode: text("provider_code").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    keyHint: text("key_hint").notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.providerCode],
      name: "provider_credentials_pk",
    }),
  ],
);

export const providerRateLimits = pgTable(
  "provider_rate_limits",
  {
    providerCode: text("provider_code").notNull(),
    searchesPerDay: integer("searches_per_day").default(1000).notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.providerCode],
      name: "provider_rate_limits_pk",
    }),
    check("provider_rate_limits_searches_per_day_check", sql`${table.searchesPerDay} >= 1`),
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

export const authorAccounts = pgTable(
  "author_accounts",
  {
    authorId: integer("author_id")
      .primaryKey()
      .references(() => authors.id, { onDelete: "cascade" }),
    login: text("login").notNull(),
    normalizedLogin: text("normalized_login").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByAdminId: integer("approved_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedByAdminId: integer("rejected_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check(
      "author_accounts_status_check",
      sql`${table.status} in ('pending_email', 'pending_approval', 'active', 'rejected')`,
    ),
  ],
);

export const authorEmails = pgTable(
  "author_emails",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull().unique(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("author_emails_author_id_idx").on(table.authorId),
    uniqueIndex("author_emails_primary_author_idx")
      .on(table.authorId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export const authorAuthIdentities = pgTable(
  "author_auth_identities",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    displayValue: text("display_value"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("author_auth_identities_author_id_idx").on(table.authorId),
    unique("author_auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const authorAuthChallenges = pgTable(
  "author_auth_challenges",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    emailId: integer("email_id").references(() => authorEmails.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("author_auth_challenges_author_id_idx").on(table.authorId),
    index("author_auth_challenges_purpose_idx").on(table.purpose),
    index("author_auth_challenges_token_hash_idx").on(table.tokenHash),
    index("author_auth_challenges_expires_at_idx").on(table.expiresAt),
    check(
      "author_auth_challenges_purpose_check",
      sql`${table.purpose} in ('verify_email', 'reset_password', 'change_email')`,
    ),
  ],
);

export const authorSessions = pgTable(
  "author_sessions",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    authMethod: text("auth_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("author_sessions_author_id_idx").on(table.authorId),
    index("author_sessions_expires_at_idx").on(table.expiresAt),
    check(
      "author_sessions_auth_method_check",
      sql`${table.authMethod} in ('password', 'access_token', 'telegram')`,
    ),
  ],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: serial("id").primaryKey(),
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (table) => [
    index("email_outbox_delivery_idx").on(table.status, table.nextAttemptAt),
    check(
      "email_outbox_template_check",
      sql`${table.template} in ('verify_email', 'reset_password', 'email_changed', 'registration_approved', 'registration_rejected')`,
    ),
    check(
      "email_outbox_status_check",
      sql`${table.status} in ('pending', 'sending', 'sent', 'failed')`,
    ),
    check("email_outbox_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const emailDeliverySettings = pgTable(
  "email_delivery_settings",
  {
    id: integer("id").primaryKey().default(1),
    provider: text("provider").default("resend").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    apiKeyHint: text("api_key_hint").notNull(),
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to"),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    check("email_delivery_settings_singleton_id_check", sql`${table.id} = 1`),
    check("email_delivery_settings_provider_check", sql`${table.provider} = 'resend'`),
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
    ...timestamps(),
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
    index("media_items_media_carrier_id_idx").on(table.mediaCarrierId),
  ],
);

export const mediaItemMetadata = pgTable("media_item_metadata", {
  mediaItemId: integer("media_item_id")
    .primaryKey()
    .references(() => mediaItems.id, { onDelete: "cascade" }),
  facts: jsonb("facts")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  sourceProvider: text("source_provider"),
  sourceExternalId: text("source_external_id"),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  ...timestamps(),
});

export const mediaItemFranchises = pgTable(
  "media_item_franchises",
  {
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    franchiseId: integer("franchise_id")
      .notNull()
      .references(() => franchises.id, { onDelete: "cascade" }),
    createdByAuthorId: integer("created_by_author_id").references(() => authors.id, {
      onDelete: "set null",
    }),
    publicationStatus: publicationStatusEnum("publication_status")
      .default(PUBLISHED_PUBLICATION_STATUS)
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.mediaItemId, table.franchiseId],
      name: "media_item_franchises_pk",
    }),
    index("media_item_franchises_franchise_id_idx").on(table.franchiseId),
    index("media_item_franchises_publication_status_idx").on(table.publicationStatus),
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
export type AuthorRegistrationSettings = typeof authorRegistrationSettings.$inferSelect;
export type CoverSettings = typeof coverSettings.$inferSelect;
export type NewCoverSettings = typeof coverSettings.$inferInsert;
export type ProviderSettings = typeof providerSettings.$inferSelect;
export type NewProviderSettings = typeof providerSettings.$inferInsert;
export type ProviderCredentials = typeof providerCredentials.$inferSelect;
export type NewProviderCredentials = typeof providerCredentials.$inferInsert;
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
export type MediaItemMetadata = typeof mediaItemMetadata.$inferSelect;
export type NewMediaItemMetadata = typeof mediaItemMetadata.$inferInsert;
export type MediaItemFranchise = typeof mediaItemFranchises.$inferSelect;
export type NewMediaItemFranchise = typeof mediaItemFranchises.$inferInsert;
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
