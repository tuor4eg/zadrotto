ALTER TABLE "admin_exports" DROP CONSTRAINT "admin_exports_entity_type_check";
--> statement-breakpoint
ALTER TABLE "admin_exports" ADD CONSTRAINT "admin_exports_entity_type_check" CHECK ("entity_type" in ('media_items', 'series', 'database_dump'));
--> statement-breakpoint
ALTER TABLE "admin_exports" ALTER COLUMN "file_size" TYPE bigint;
