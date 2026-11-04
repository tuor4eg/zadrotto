ALTER TABLE "jobs" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

CREATE TABLE "media_item_editorial_summaries" (
  "media_item_id" integer PRIMARY KEY REFERENCES "media_items"("id") ON DELETE CASCADE,
  "summary" text,
  "status" text NOT NULL,
  "generated_at" timestamptz,
  "attempted_at" timestamptz,
  "model_id" text,
  "source_hash" text,
  "locked" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "media_item_editorial_summaries_status_check" CHECK ("status" IN ('ready', 'unusable')),
  CONSTRAINT "media_item_editorial_summaries_ready_check" CHECK ("status" <> 'ready' OR nullif(btrim("summary"), '') IS NOT NULL)
);
--> statement-breakpoint

CREATE UNIQUE INDEX "job_runs_editorial_summary_active_unique"
  ON "job_runs" (("payload"->>'mediaItemId'))
  WHERE "type" = 'media.editorial-summary-generate' AND "status" IN ('queued', 'running');
--> statement-breakpoint

INSERT INTO "jobs" ("code", "type", "payload", "options", "cron_expression", "next_run_at", "enabled")
VALUES (
  'media-editorial-summaries',
  'media.editorial-summary-sweep',
  '{}'::jsonb,
  '{"prompt":"Напиши короткую редакционную справку о произведении для архивной карточки. Объясни, что это за произведение и чем оно выделяется, опираясь только на предоставленные сведения."}'::jsonb,
  '0 * * * *',
  now() + interval '1 hour',
  false
)
ON CONFLICT ("code") DO NOTHING;
