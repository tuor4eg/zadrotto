CREATE TABLE "quiz_participants" (
  "quiz_id" integer NOT NULL,
  "author_id" integer NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quiz_participants_pk" PRIMARY KEY("quiz_id", "author_id")
);--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_participants_author_id_idx" ON "quiz_participants" USING btree ("author_id");
