ALTER TABLE "media_items" ADD COLUMN "metadata_issue_code" text;
--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_metadata_issue_code_check"
  CHECK ("metadata_issue_code" IS NULL OR "metadata_issue_code" IN (
    'no-candidates', 'title-mismatch', 'year-mismatch', 'ambiguous-match',
    'no-provider-metadata', 'provider-error', 'unsupported-source'
  ));
