CREATE TABLE "admin_activity_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_type" text NOT NULL,
  "admin_user_id" integer,
  "author_id" integer,
  "action" text NOT NULL,
  "entity_type" text,
  "entity_id" integer,
  "entity_label" text,
  "status" text NOT NULL,
  "message" text,
  "ip_address" text,
  "user_agent" text,
  "metadata" jsonb
);

ALTER TABLE "admin_activity_logs"
  ADD CONSTRAINT "admin_activity_logs_admin_user_id_admin_users_id_fk"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL;

ALTER TABLE "admin_activity_logs"
  ADD CONSTRAINT "admin_activity_logs_author_id_authors_id_fk"
  FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL;

CREATE INDEX "admin_activity_logs_created_at_idx" ON "admin_activity_logs" ("created_at" DESC);
CREATE INDEX "admin_activity_logs_actor_admin_idx" ON "admin_activity_logs" ("actor_type", "admin_user_id");
CREATE INDEX "admin_activity_logs_actor_author_idx" ON "admin_activity_logs" ("actor_type", "author_id");
CREATE INDEX "admin_activity_logs_entity_idx" ON "admin_activity_logs" ("entity_type", "entity_id");
CREATE INDEX "admin_activity_logs_action_idx" ON "admin_activity_logs" ("action");
