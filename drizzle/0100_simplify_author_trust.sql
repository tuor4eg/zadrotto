ALTER TABLE "trust_action_rules" ADD COLUMN "counts_toward_trust" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "trust_action_rules"
SET "counts_toward_trust" = "catalog_trust_points" > 0,
    "trust_points" = greatest("catalog_trust_points", 1);
--> statement-breakpoint
UPDATE "trust_settings"
SET "minimum_trust_points" = greatest("minimum_catalog_trust_points", 1);
--> statement-breakpoint
UPDATE "author_action_ledger"
SET "trust_delta" = "catalog_trust_delta";
--> statement-breakpoint
UPDATE "author_trust"
SET "trust_points" = "catalog_trust_points";
--> statement-breakpoint
DROP INDEX "author_trust_catalog_points_author_idx";
ALTER TABLE "trust_settings" DROP CONSTRAINT "trust_settings_minimum_trust_points_check";
ALTER TABLE "trust_settings" DROP CONSTRAINT "trust_settings_minimum_catalog_trust_points_check";
ALTER TABLE "trust_action_rules" DROP CONSTRAINT "trust_action_rules_points_check";
ALTER TABLE "author_trust" DROP CONSTRAINT "author_trust_non_negative_check";
ALTER TABLE "author_action_ledger" DROP CONSTRAINT "author_action_ledger_delta_check";
ALTER TABLE "author_action_ledger" DROP CONSTRAINT "author_action_ledger_entry_shape_check";
--> statement-breakpoint
ALTER TABLE "trust_settings" DROP COLUMN "minimum_catalog_trust_points";
ALTER TABLE "trust_action_rules" DROP COLUMN "catalog_trust_points";
ALTER TABLE "author_trust" DROP COLUMN "catalog_trust_points";
ALTER TABLE "author_action_ledger" DROP COLUMN "catalog_trust_delta";
--> statement-breakpoint
ALTER TABLE "trust_settings" ALTER COLUMN "minimum_trust_points" SET DEFAULT 5;
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_minimum_trust_points_check" CHECK ("minimum_trust_points" >= 1);
ALTER TABLE "trust_action_rules" ADD CONSTRAINT "trust_action_rules_points_check" CHECK ("trust_points" >= 1);
ALTER TABLE "author_trust" ADD CONSTRAINT "author_trust_non_negative_check" CHECK ("trust_points" >= 0 and "successful_outcomes" >= 0 and "rejected_outcomes" >= 0);
ALTER TABLE "author_action_ledger" ADD CONSTRAINT "author_action_ledger_delta_check" CHECK ("xp_delta" >= 0 and "trust_delta" >= 0);
ALTER TABLE "author_action_ledger" ADD CONSTRAINT "author_action_ledger_entry_shape_check" CHECK (("entry_kind" = 'reward' and "reward_key" is not null and "outcome" is null) or ("entry_kind" = 'outcome' and "reward_key" is null and "xp_delta" = 0 and "trust_delta" = 0 and "outcome" is not null));
