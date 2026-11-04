CREATE TABLE "quizzes" (
  "id" serial PRIMARY KEY NOT NULL,
  "question" text,
  "image_object_key" text,
  "answer_media_item_id" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quizzes_period_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "quizzes_content_check" CHECK (nullif(btrim("question"), '') IS NOT NULL OR "image_object_key" IS NOT NULL)
);--> statement-breakpoint
CREATE TABLE "quiz_media_types" (
  "quiz_id" integer NOT NULL,
  "media_type" text NOT NULL,
  CONSTRAINT "quiz_media_types_pk" PRIMARY KEY("quiz_id", "media_type")
);--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_answer_media_item_id_media_items_id_fk" FOREIGN KEY ("answer_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_media_types" ADD CONSTRAINT "quiz_media_types_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_media_types" ADD CONSTRAINT "quiz_media_types_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quizzes_answer_media_item_id_idx" ON "quizzes" USING btree ("answer_media_item_id");--> statement-breakpoint
CREATE INDEX "quizzes_active_idx" ON "quizzes" USING btree ("enabled", "starts_at", "ends_at");--> statement-breakpoint
CREATE INDEX "quiz_media_types_media_type_idx" ON "quiz_media_types" USING btree ("media_type");
