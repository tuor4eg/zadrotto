ALTER TABLE "tier_lists" ADD COLUMN "preview_object_key" text;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD COLUMN "preview_version" integer;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD COLUMN "preview_media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD CONSTRAINT "tier_lists_preview_check" CHECK (("tier_lists"."preview_object_key" is null and "tier_lists"."preview_version" is null) or ("tier_lists"."preview_object_key" is not null and "tier_lists"."preview_version" is not null and "tier_lists"."preview_version" > 0 and "tier_lists"."preview_version" <= "tier_lists"."version"));
--> statement-breakpoint
INSERT INTO job_runs (type, payload, source, scheduled_for, available_at, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds)
SELECT 'tier-lists.preview-generate', jsonb_build_object('listId', t.id, 'version', t.version), 'event', now(), now(), 3, 120, 60, 3600
FROM tier_lists t JOIN authors a ON a.id = t.author_id
WHERE t.status = 'published' AND t.hidden_at IS NULL AND a.blocked_at IS NULL AND a.merged_into_author_id IS NULL;
