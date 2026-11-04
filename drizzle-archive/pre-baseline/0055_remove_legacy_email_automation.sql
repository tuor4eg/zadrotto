DROP TABLE "email_automation_jobs";
--> statement-breakpoint
ALTER TABLE "email_automation_settings" DROP CONSTRAINT "email_automation_delivery_interval_check";
--> statement-breakpoint
ALTER TABLE "email_automation_settings" DROP CONSTRAINT "email_automation_cleanup_interval_check";
--> statement-breakpoint
ALTER TABLE "email_automation_settings" DROP COLUMN "delivery_interval_seconds";
--> statement-breakpoint
ALTER TABLE "email_automation_settings" DROP COLUMN "cleanup_interval_seconds";
