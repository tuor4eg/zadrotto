import { sql } from "drizzle-orm";
import {
  check,
  type AnyPgColumn,
  boolean,
  date,
  foreignKey,
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
  uuid,
} from "drizzle-orm/pg-core";

import { FIRST_EXPERIENCED_PRECISIONS } from "@/lib/authors/media-experiences";
import { CONTRIBUTION_STATUSES, CONTRIBUTION_TYPES } from "@/lib/contributions/model";
import { AUTHOR_MEDIA_STATUSES, type AuthorMediaStatus } from "@/lib/media/author-media-status";
import { PUBLISHED_PUBLICATION_STATUS, PUBLICATION_STATUSES } from "@/lib/media/publication-status";
import { JOB_RUN_SOURCES, JOB_RUN_STATUSES } from "@/lib/jobs/model";
import { TELEGRAM_TRANSPORT_CODE } from "@/lib/notifications/transports/catalog";
import { normalizedSearchIndexSql } from "@/db/search";

export const publicationStatusEnum = pgEnum("publication_status", PUBLICATION_STATUSES);
export const contributionTypeEnum = pgEnum("contribution_type", CONTRIBUTION_TYPES);
export const contributionStatusEnum = pgEnum("contribution_status", CONTRIBUTION_STATUSES);
export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted"]);
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
  parentId: integer("parent_id").references((): AnyPgColumn => franchises.id, {
    onDelete: "restrict",
  }),
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
  index("franchises_parent_id_idx").on(table.parentId),
  index("franchises_created_by_author_id_idx").on(table.createdByAuthorId),
  index("franchises_publication_status_idx").on(table.publicationStatus),
  index("franchises_title_search_idx").using("gin", normalizedSearchIndexSql(table.title)),
  index("franchises_original_title_search_idx").using("gin", normalizedSearchIndexSql(table.originalTitle)),
  index("franchises_code_search_idx").using("gin", normalizedSearchIndexSql(table.code)),
  check(
    "franchises_parent_not_self_check",
    sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
  ),
]);

export const mediaTypes = pgTable("media_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isPubliclyAvailable: boolean("is_publicly_available").default(false).notNull(),
  isAvailableToGuests: boolean("is_available_to_guests").default(false).notNull(),
  enabledByDefault: boolean("enabled_by_default").default(true).notNull(),
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

export const archiveSettings = pgTable(
  "archive_settings",
  {
    id: integer("id").primaryKey().default(1),
    maxTitleAliases: integer("max_title_aliases").default(3).notNull(),
    maxFranchiseDepth: integer("max_franchise_depth").default(3).notNull(),
    dailyDossierMinAverageScore: integer("daily_dossier_min_average_score")
      .default(6)
      .notNull(),
    recentlyViewedHistoryLimit: integer("recently_viewed_history_limit").default(50).notNull(),
    recentlyViewedTtlDays: integer("recently_viewed_ttl_days").default(90).notNull(),
    topArchiveMinAverageScore: integer("top_archive_min_average_score").default(0).notNull(),
    topArchiveMinRatingsCount: integer("top_archive_min_ratings_count").default(1).notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check("archive_settings_singleton_id_check", sql`${table.id} = 1`),
    check(
      "archive_settings_max_title_aliases_check",
      sql`${table.maxTitleAliases} between 1 and 10`,
    ),
    check("archive_settings_max_franchise_depth_check", sql`${table.maxFranchiseDepth} between 2 and 5`),
    check(
      "archive_settings_daily_dossier_min_average_score_check",
      sql`${table.dailyDossierMinAverageScore} between 0 and 10`,
    ),
    check("archive_settings_recently_viewed_history_limit_check", sql`${table.recentlyViewedHistoryLimit} between 1 and 500`),
    check("archive_settings_recently_viewed_ttl_days_check", sql`${table.recentlyViewedTtlDays} between 1 and 365`),
    check("archive_settings_top_archive_min_average_score_check", sql`${table.topArchiveMinAverageScore} between 0 and 10`),
    check("archive_settings_top_archive_min_ratings_count_check", sql`${table.topArchiveMinRatingsCount} between 0 and 1000`),
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
    titleSearchMode: text("title_search_mode").default("parallel").notNull(),
    coverSearchEnabled: boolean("cover_search_enabled").default(true).notNull(),
    priority: integer("priority").default(100).notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.mediaType, table.providerCode],
      name: "provider_settings_pk",
    }),
    check("provider_settings_priority_check", sql`${table.priority} >= 1`),
    check(
      "provider_settings_title_search_mode_check",
      sql`${table.titleSearchMode} in ('parallel', 'fallback', 'off')`,
    ),
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

export const providerImageSettings = pgTable("provider_image_settings", {
  providerCode: text("provider_code").primaryKey(),
  proxyImagesEnabled: boolean("proxy_images_enabled").default(false).notNull(),
  updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  ...timestamps(),
}, (table) => [
  check("provider_image_settings_code_check", sql`btrim(${table.providerCode}) <> ''`),
]);

export const aiProviderSettings = pgTable(
  "ai_provider_settings",
  {
    providerCode: text("provider_code").primaryKey(),
    enabled: boolean("enabled").default(false).notNull(),
    defaultModelId: text("default_model_id"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check("ai_provider_settings_code_check", sql`btrim(${table.providerCode}) <> ''`),
  ],
);

export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    providerCode: text("provider_code").primaryKey(),
    encryptedPayload: text("encrypted_payload").notNull(),
    keyHint: text("key_hint").notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check("ai_provider_credentials_code_check", sql`btrim(${table.providerCode}) <> ''`),
  ],
);

export const aiScenarioProfiles = pgTable(
  "ai_scenario_profiles",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    providerCode: text("provider_code").notNull(),
    modelId: text("model_id"),
    instruction: text("instruction"),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().default({}).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("ai_scenario_profiles_key_unique").on(table.key),
    check("ai_scenario_profiles_key_check", sql`btrim(${table.key}) <> ''`),
    check("ai_scenario_profiles_provider_code_check", sql`btrim(${table.providerCode}) <> ''`),
  ],
);

export const aiCallLogs = pgTable(
  "ai_call_logs",
  {
    id: serial("id").primaryKey(),
    scenarioProfileId: integer("scenario_profile_id").references(() => aiScenarioProfiles.id, {
      onDelete: "set null",
    }),
    profileKey: text("profile_key").notNull(),
    providerCode: text("provider_code"),
    modelId: text("model_id"),
    status: text("status").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    providerRequestId: text("provider_request_id"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_call_logs_created_at_idx").on(table.createdAt),
    index("ai_call_logs_profile_created_at_idx").on(table.profileKey, table.createdAt),
    index("ai_call_logs_status_created_at_idx").on(table.status, table.createdAt),
    check("ai_call_logs_status_check", sql`${table.status} in ('success', 'failure')`),
    check("ai_call_logs_latency_check", sql`${table.latencyMs} >= 0`),
    check("ai_call_logs_input_tokens_check", sql`${table.inputTokens} is null or ${table.inputTokens} >= 0`),
    check("ai_call_logs_output_tokens_check", sql`${table.outputTokens} is null or ${table.outputTokens} >= 0`),
    check(
      "ai_call_logs_error_code_check",
      sql`${table.errorCode} is null or ${table.errorCode} in ('configuration', 'authentication', 'rate-limit', 'timeout', 'provider-unavailable', 'invalid-response')`,
    ),
  ],
);

export const authors = pgTable("authors", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  avatarObjectKey: text("avatar_object_key"),
  isSystem: boolean("is_system").default(false).notNull(),
  isDiscoverable: boolean("is_discoverable").default(true).notNull(),
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
  uniqueIndex("authors_avatar_object_key_unique")
    .on(table.avatarObjectKey)
    .where(sql`${table.avatarObjectKey} is not null`),
  index("authors_name_search_idx").using("gin", normalizedSearchIndexSql(table.name)),
]);

export const authorFriendships = pgTable(
  "author_friendships",
  {
    id: serial("id").primaryKey(),
    firstAuthorId: integer("first_author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    secondAuthorId: integer("second_author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    requestedByAuthorId: integer("requested_by_author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").default("pending").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    unique("author_friendships_pair_unique").on(table.firstAuthorId, table.secondAuthorId),
    index("author_friendships_first_status_idx").on(table.firstAuthorId, table.status),
    index("author_friendships_second_status_idx").on(table.secondAuthorId, table.status),
    index("author_friendships_requester_status_idx").on(table.requestedByAuthorId, table.status),
    check("author_friendships_canonical_pair_check", sql`${table.firstAuthorId} < ${table.secondAuthorId}`),
    check(
      "author_friendships_requester_member_check",
      sql`${table.requestedByAuthorId} in (${table.firstAuthorId}, ${table.secondAuthorId})`,
    ),
    check(
      "author_friendships_accepted_at_check",
      sql`(${table.status} = 'accepted' and ${table.acceptedAt} is not null) or (${table.status} = 'pending' and ${table.acceptedAt} is null)`,
    ),
  ],
);

export const authorMediaTypeSettings = pgTable(
  "author_media_type_settings",
  {
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    mediaTypeId: integer("media_type_id")
      .notNull()
      .references(() => mediaTypes.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.authorId, table.mediaTypeId],
      name: "author_media_type_settings_pk",
    }),
  ],
);

export const authorAccessProfileMediaTypes = pgTable(
  "author_access_profile_media_types",
  {
    accessProfileId: integer("access_profile_id")
      .notNull()
      .references(() => authorAccessProfiles.id, { onDelete: "cascade" }),
    mediaTypeId: integer("media_type_id")
      .notNull()
      .references(() => mediaTypes.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.accessProfileId, table.mediaTypeId],
      name: "author_access_profile_media_types_pk",
    }),
  ],
);

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
    index("email_outbox_status_created_id_idx").on(table.status, table.createdAt, table.id),
    index("email_outbox_created_id_idx").on(table.createdAt, table.id),
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

export const emailAutomationSettings = pgTable(
  "email_automation_settings",
  {
    id: integer("id").primaryKey().default(1),
    deliveryBatchSize: integer("delivery_batch_size").default(10).notNull(),
    deliveryMaxAttempts: integer("delivery_max_attempts").default(5).notNull(),
    retryBaseSeconds: integer("retry_base_seconds").default(120).notNull(),
    retryMaxSeconds: integer("retry_max_seconds").default(3600).notNull(),
    challengeRetentionHours: integer("challenge_retention_hours").default(24).notNull(),
    sessionRetentionDays: integer("session_retention_days").default(7).notNull(),
    staleRegistrationDays: integer("stale_registration_days").default(7).notNull(),
    sentOutboxRetentionDays: integer("sent_outbox_retention_days").default(30).notNull(),
    failedOutboxRetentionDays: integer("failed_outbox_retention_days").default(30).notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    check("email_automation_settings_singleton_id_check", sql`${table.id} = 1`),
    check("email_automation_delivery_batch_check", sql`${table.deliveryBatchSize} between 1 and 50`),
    check("email_automation_delivery_attempts_check", sql`${table.deliveryMaxAttempts} between 1 and 20`),
    check("email_automation_retry_base_check", sql`${table.retryBaseSeconds} between 60 and 86400`),
    check("email_automation_retry_max_check", sql`${table.retryMaxSeconds} between ${table.retryBaseSeconds} and 604800`),
    check("email_automation_challenge_retention_check", sql`${table.challengeRetentionHours} between 1 and 720`),
    check("email_automation_session_retention_check", sql`${table.sessionRetentionDays} between 1 and 365`),
    check("email_automation_registration_retention_check", sql`${table.staleRegistrationDays} between 1 and 90`),
    check("email_automation_sent_retention_check", sql`${table.sentOutboxRetentionDays} between 1 and 365`),
    check("email_automation_failed_retention_check", sql`${table.failedOutboxRetentionDays} between 7 and 730`),
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

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    cronExpression: text("cron_expression").notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    timeoutSeconds: integer("timeout_seconds").default(300).notNull(),
    retryBaseSeconds: integer("retry_base_seconds").default(60).notNull(),
    retryMaxSeconds: integer("retry_max_seconds").default(3600).notNull(),
    historyRetentionDays: integer("history_retention_days").default(30).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("jobs_scheduler_idx").on(table.enabled, table.nextRunAt),
    check("jobs_code_check", sql`btrim(${table.code}) <> ''`),
    check("jobs_type_check", sql`btrim(${table.type}) <> ''`),
    check("jobs_max_attempts_check", sql`${table.maxAttempts} >= 1`),
    check("jobs_timeout_seconds_check", sql`${table.timeoutSeconds} >= 1`),
    check("jobs_retry_base_seconds_check", sql`${table.retryBaseSeconds} >= 1`),
    check("jobs_retry_max_seconds_check", sql`${table.retryMaxSeconds} >= ${table.retryBaseSeconds}`),
    check("jobs_history_retention_days_check", sql`${table.historyRetentionDays} between 1 and 365`),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    retryOfRunId: integer("retry_of_run_id").references((): AnyPgColumn => jobRuns.id, {
      onDelete: "set null",
    }),
    createdByAdminId: integer("created_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    source: text("source").notNull(),
    status: text("status").default("queued").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    timeoutSeconds: integer("timeout_seconds").notNull(),
    retryBaseSeconds: integer("retry_base_seconds").notNull(),
    retryMaxSeconds: integer("retry_max_seconds").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lockToken: text("lock_token"),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    ...timestamps(),
  },
  (table) => [
    index("job_runs_queue_idx").on(table.availableAt, table.id).where(sql`${table.status} = 'queued'`),
    index("job_runs_recovery_idx").on(table.lockExpiresAt).where(sql`${table.status} = 'running'`),
    index("job_runs_job_created_idx").on(table.jobId, table.createdAt),
    index("job_runs_job_finished_idx").on(table.jobId, table.finishedAt),
    index("job_runs_type_created_idx").on(table.type, table.createdAt),
    uniqueIndex("job_runs_scheduled_job_occurrence_unique")
      .on(table.jobId, table.scheduledFor)
      .where(sql`${table.source} = 'schedule'`),
    check("job_runs_type_check", sql`btrim(${table.type}) <> ''`),
    check("job_runs_source_check", sql`${table.source} in (${sql.join(JOB_RUN_SOURCES.map((value) => sql`${value}`), sql`, `)})`),
    check("job_runs_status_check", sql`${table.status} in (${sql.join(JOB_RUN_STATUSES.map((value) => sql`${value}`), sql`, `)})`),
    check("job_runs_attempts_check", sql`${table.attempts} >= 0 and ${table.attempts} <= ${table.maxAttempts}`),
    check("job_runs_max_attempts_check", sql`${table.maxAttempts} >= 1`),
    check("job_runs_timeout_seconds_check", sql`${table.timeoutSeconds} >= 1`),
    check("job_runs_retry_base_seconds_check", sql`${table.retryBaseSeconds} >= 1`),
    check("job_runs_retry_max_seconds_check", sql`${table.retryMaxSeconds} >= ${table.retryBaseSeconds}`),
  ],
);

export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    actorAuthorId: integer("actor_author_id").references(() => authors.id, {
      onDelete: "set null",
    }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("domain_events_type_occurred_at_idx").on(table.type, table.occurredAt),
    index("domain_events_actor_occurred_at_idx").on(table.actorAuthorId, table.occurredAt),
    check("domain_events_type_check", sql`btrim(${table.type}) <> ''`),
    check("domain_events_schema_version_check", sql`${table.schemaVersion} >= 1`),
    check("domain_events_aggregate_type_check", sql`btrim(${table.aggregateType}) <> ''`),
    check("domain_events_aggregate_id_check", sql`btrim(${table.aggregateId}) <> ''`),
  ],
);

export const domainEventOutbox = pgTable(
  "domain_event_outbox",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => domainEvents.id, { onDelete: "cascade" }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("domain_event_outbox_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.dispatchedAt} is null`),
  ],
);

export const domainEventConsumptions = pgTable(
  "domain_event_consumptions",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => domainEvents.id, { onDelete: "cascade" }),
    consumerKey: text("consumer_key").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.consumerKey] }),
    check("domain_event_consumptions_consumer_key_check", sql`btrim(${table.consumerKey}) <> ''`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientType: text("recipient_type").notNull(),
    recipientId: integer("recipient_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_recipient_created_at_idx").on(
      table.recipientType,
      table.recipientId,
      table.createdAt,
    ),
    index("notifications_recipient_unread_idx")
      .on(table.recipientType, table.recipientId)
      .where(sql`${table.readAt} is null`),
    check(
      "notifications_recipient_type_check",
      sql`${table.recipientType} in ('admin', 'author')`,
    ),
    check("notifications_type_check", sql`btrim(${table.type}) <> ''`),
    check("notifications_title_check", sql`btrim(${table.title}) <> ''`),
    check("notifications_body_check", sql`btrim(${table.body}) <> ''`),
    check("notifications_entity_type_check", sql`btrim(${table.entityType}) <> ''`),
    check("notifications_entity_id_check", sql`btrim(${table.entityId}) <> ''`),
  ],
);

export const notificationTransportSettings = pgTable(
  "notification_transport_settings",
  {
    code: text("code").primaryKey(),
    enabled: boolean("enabled").default(false).notNull(),
    encryptedPayload: text("encrypted_payload"),
    keyHint: text("key_hint"),
    chatIds: jsonb("chat_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    updatedByAdminId: integer("updated_by_admin_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    check("notification_transport_settings_code_check", sql`${table.code} in (${sql`${TELEGRAM_TRANSPORT_CODE}`})`),
    check("notification_transport_settings_code_trim_check", sql`btrim(${table.code}) <> ''`),
  ],
);

export const achievements = pgTable(
  "achievements",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    mechanic: text("mechanic").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    imageObjectKey: text("image_object_key"),
    enabled: boolean("enabled").default(true).notNull(),
    showWhenLocked: boolean("show_when_locked").default(true).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    check("achievements_code_check", sql`btrim(${table.code}) <> ''`),
    check("achievements_name_check", sql`btrim(${table.name}) <> ''`),
    check("achievements_description_check", sql`btrim(${table.description}) <> ''`),
    check("achievements_mechanic_check", sql`btrim(${table.mechanic}) <> ''`),
  ],
);

export const achievementLevels = pgTable(
  "achievement_levels",
  {
    id: serial("id").primaryKey(),
    achievementId: integer("achievement_id").notNull().references(() => achievements.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    threshold: integer("threshold").notNull(),
    name: text("name"),
    description: text("description"),
    imageObjectKey: text("image_object_key"),
    ...timestamps(),
  },
  (table) => [
    unique("achievement_levels_achievement_level_unique").on(table.achievementId, table.level),
    unique("achievement_levels_achievement_threshold_unique").on(table.achievementId, table.threshold),
    index("achievement_levels_achievement_id_idx").on(table.achievementId),
    check("achievement_levels_level_check", sql`${table.level} > 0`),
    check("achievement_levels_threshold_check", sql`${table.threshold} > 0`),
    check("achievement_levels_name_check", sql`${table.name} is null or btrim(${table.name}) <> ''`),
    check("achievement_levels_description_check", sql`${table.description} is null or btrim(${table.description}) <> ''`),
  ],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    achievementLevelId: integer("achievement_level_id")
      .notNull()
      .references(() => achievementLevels.id, { onDelete: "restrict" }),
    sourceEventId: uuid("source_event_id").references(() => domainEvents.id, {
      onDelete: "set null",
    }),
    awardGroupId: uuid("award_group_id").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
    announcedAt: timestamp("announced_at", { withTimezone: true }),
  },
  (table) => [
    unique("user_achievements_author_achievement_level_unique").on(
      table.authorId,
      table.achievementLevelId,
    ),
    index("user_achievements_author_awarded_at_idx").on(table.authorId, table.awardedAt),
    index("user_achievements_pending_announcement_idx")
      .on(table.authorId, table.awardGroupId, table.awardedAt)
      .where(sql`${table.announcedAt} is null`),
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
  (table) => [
    index("media_carriers_name_search_idx").using("gin", normalizedSearchIndexSql(table.name)),
    index("media_carriers_description_search_idx").using("gin", normalizedSearchIndexSql(table.description)),
    index("media_carriers_code_search_idx").using("gin", normalizedSearchIndexSql(table.code)),
  ],
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
    coverThumbAttemptedAt: timestamp("cover_thumb_attempted_at", { withTimezone: true }),
    coverSourceProvider: text("cover_source_provider"),
    coverSourceExternalId: text("cover_source_external_id"),
    coverSourcePageUrl: text("cover_source_page_url"),
    authorCreationRequestId: text("author_creation_request_id"),
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
    index("media_items_title_search_idx").using("gin", normalizedSearchIndexSql(table.title)),
    index("media_items_original_title_search_idx").using("gin", normalizedSearchIndexSql(table.originalTitle)),
    index("media_items_code_search_idx").using("gin", normalizedSearchIndexSql(table.code)),
    index("media_items_created_by_author_id_idx").on(table.createdByAuthorId),
    index("media_items_cover_thumb_attempted_at_idx").on(table.coverThumbAttemptedAt),
    uniqueIndex("media_items_author_creation_request_id_unique_idx").on(
      table.createdByAuthorId,
      table.authorCreationRequestId,
    ),
    index("media_items_media_carrier_id_idx").on(table.mediaCarrierId),
  ],
);

export const quizzes = pgTable(
  "quizzes",
  {
    id: serial("id").primaryKey(),
    question: text("question"),
    imageObjectKey: text("image_object_key"),
    answerMediaItemId: integer("answer_media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("quizzes_answer_media_item_id_idx").on(table.answerMediaItemId),
    index("quizzes_active_idx").on(table.enabled, table.startsAt, table.endsAt),
    check("quizzes_period_check", sql`${table.startsAt} < ${table.endsAt}`),
    check(
      "quizzes_content_check",
      sql`nullif(btrim(${table.question}), '') is not null or ${table.imageObjectKey} is not null`,
    ),
  ],
);

export const quizMediaTypes = pgTable(
  "quiz_media_types",
  {
    quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().references(() => mediaTypes.code),
  },
  (table) => [
    primaryKey({ columns: [table.quizId, table.mediaType], name: "quiz_media_types_pk" }),
    index("quiz_media_types_media_type_idx").on(table.mediaType),
  ],
);

export const quizParticipants = pgTable(
  "quiz_participants",
  {
    quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
    authorId: integer("author_id").notNull().references(() => authors.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.quizId, table.authorId], name: "quiz_participants_pk" }),
    index("quiz_participants_author_id_idx").on(table.authorId),
  ],
);

export const mediaItemTitleAliases = pgTable(
  "media_item_title_aliases",
  {
    id: serial("id").primaryKey(),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (table) => [
    uniqueIndex("media_item_title_aliases_media_item_value_lower_unique_idx").on(
      table.mediaItemId,
      sql`lower(${table.value})`,
    ),
    index("media_item_title_aliases_media_item_id_idx").on(table.mediaItemId),
    index("media_item_title_aliases_value_search_idx").using(
      "gin",
      normalizedSearchIndexSql(table.value),
    ),
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

export const mediaItemFranchiseRemovalRequests = pgTable(
  "media_item_franchise_removal_requests",
  {
    mediaItemId: integer("media_item_id").notNull(),
    franchiseId: integer("franchise_id").notNull(),
    requestedByAuthorId: integer("requested_by_author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.mediaItemId, table.franchiseId],
      name: "media_item_franchise_removal_requests_pk",
    }),
    foreignKey({
      columns: [table.mediaItemId, table.franchiseId],
      foreignColumns: [mediaItemFranchises.mediaItemId, mediaItemFranchises.franchiseId],
      name: "media_item_franchise_removal_requests_link_fk",
    }).onDelete("cascade"),
    index("media_item_franchise_removal_requests_author_id_idx").on(table.requestedByAuthorId),
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

export const authorMediaStatuses = pgTable(
  "author_media_statuses",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    status: text("status").$type<AuthorMediaStatus>().notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("author_media_statuses_author_media_unique").on(table.authorId, table.mediaItemId),
    index("author_media_statuses_author_status_idx").on(table.authorId, table.status),
    index("author_media_statuses_media_item_id_idx").on(table.mediaItemId),
    check(
      "author_media_statuses_status_check",
      sql`${table.status} in (${sql.join(AUTHOR_MEDIA_STATUSES.map((status) => sql`${status}`), sql`, `)})`,
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
export type ArchiveSettings = typeof archiveSettings.$inferSelect;
export type ProviderSettings = typeof providerSettings.$inferSelect;
export type NewProviderSettings = typeof providerSettings.$inferInsert;
export type ProviderCredentials = typeof providerCredentials.$inferSelect;
export type NewProviderCredentials = typeof providerCredentials.$inferInsert;
export type AiProviderSettings = typeof aiProviderSettings.$inferSelect;
export type AiProviderCredentials = typeof aiProviderCredentials.$inferSelect;
export type AiScenarioProfile = typeof aiScenarioProfiles.$inferSelect;
export type AiCallLog = typeof aiCallLogs.$inferSelect;
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
export type MediaItemTitleAlias = typeof mediaItemTitleAliases.$inferSelect;
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
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationTransportSettings = typeof notificationTransportSettings.$inferSelect;
export type NewNotificationTransportSettings = typeof notificationTransportSettings.$inferInsert;
