ALTER TABLE "authors" ADD COLUMN "avatar_object_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "authors_avatar_object_key_unique"
  ON "authors" USING btree ("avatar_object_key")
  WHERE "authors"."avatar_object_key" is not null;
