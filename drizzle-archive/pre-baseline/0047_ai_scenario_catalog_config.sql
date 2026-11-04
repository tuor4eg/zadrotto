ALTER TABLE "ai_scenario_profiles" ADD COLUMN "instruction" text;
--> statement-breakpoint
ALTER TABLE "ai_scenario_profiles" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;
