ALTER TABLE "franchises" ADD COLUMN "parent_id" integer;
--> statement-breakpoint
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_parent_not_self_check"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
--> statement-breakpoint
CREATE INDEX "franchises_parent_id_idx" ON "franchises" USING btree ("parent_id");
