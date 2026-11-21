import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ClassificationManifest, ClassificationSnapshot } from "@/lib/classification-migration/model";

/** Durable journal: deliberately has no job-run FK or retention/cleanup cascade. */
export const classificationMigrationRuns = pgTable("classification_migration_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").$type<"preview" | "approved" | "applied" | "rolled_back">().notNull().default("preview"),
  manifest: jsonb("manifest").$type<ClassificationManifest>().notNull(),
  beforeSnapshot: jsonb("before_snapshot").$type<ClassificationSnapshot>().notNull(),
  preview: jsonb("preview").$type<Record<string, unknown>>().notNull(),
  previewHash: text("preview_hash").notNull(),
  afterHash: text("after_hash"),
  afterSnapshot: jsonb("after_snapshot").$type<ClassificationSnapshot>(),
  createdByAdminId: integer("created_by_admin_id").notNull(),
  approvedByAdminId: integer("approved_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rollbackApprovedByAdminId: integer("rollback_approved_by_admin_id"),
  rollbackApprovedAt: timestamp("rollback_approved_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
}, table => [check("classification_migration_runs_status_check", sql`${table.status} in ('preview','approved','applied','rolled_back')`)]);
