ALTER TABLE "ai_scenario_profiles" DROP CONSTRAINT "ai_scenario_profiles_model_id_check";
--> statement-breakpoint
ALTER TABLE "ai_scenario_profiles" ALTER COLUMN "model_id" DROP NOT NULL;
