CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted');
--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "is_discoverable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE "author_friendships" (
  "id" serial PRIMARY KEY NOT NULL,
  "first_author_id" integer NOT NULL,
  "second_author_id" integer NOT NULL,
  "requested_by_author_id" integer NOT NULL,
  "status" "friendship_status" DEFAULT 'pending' NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "author_friendships_pair_unique" UNIQUE("first_author_id", "second_author_id"),
  CONSTRAINT "author_friendships_canonical_pair_check" CHECK ("first_author_id" < "second_author_id"),
  CONSTRAINT "author_friendships_requester_member_check" CHECK ("requested_by_author_id" in ("first_author_id", "second_author_id")),
  CONSTRAINT "author_friendships_accepted_at_check" CHECK (("status" = 'accepted' and "accepted_at" is not null) or ("status" = 'pending' and "accepted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "author_friendships" ADD CONSTRAINT "author_friendships_first_author_id_authors_id_fk" FOREIGN KEY ("first_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "author_friendships" ADD CONSTRAINT "author_friendships_second_author_id_authors_id_fk" FOREIGN KEY ("second_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "author_friendships" ADD CONSTRAINT "author_friendships_requested_by_author_id_authors_id_fk" FOREIGN KEY ("requested_by_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "author_friendships_first_status_idx" ON "author_friendships" USING btree ("first_author_id", "status");
--> statement-breakpoint
CREATE INDEX "author_friendships_second_status_idx" ON "author_friendships" USING btree ("second_author_id", "status");
--> statement-breakpoint
CREATE INDEX "author_friendships_requester_status_idx" ON "author_friendships" USING btree ("requested_by_author_id", "status");
--> statement-breakpoint
CREATE INDEX "authors_name_search_idx" ON "authors" USING gin (replace(lower(regexp_replace(btrim(coalesce("name", '')), '\\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
