CREATE TABLE "review_reactions" (
  "review_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_reactions_pk" PRIMARY KEY("review_id","type","user_id"),
  CONSTRAINT "review_reactions_type_check" CHECK ("review_reactions"."type" in ('like'))
);
--> statement-breakpoint
ALTER TABLE "review_reactions" ADD CONSTRAINT "review_reactions_review_id_contribution_reviews_contribution_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."contribution_reviews"("contribution_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_reactions" ADD CONSTRAINT "review_reactions_user_id_authors_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "review_reactions_user_id_idx" ON "review_reactions" USING btree ("user_id");
