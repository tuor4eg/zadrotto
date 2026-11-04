CREATE TABLE "quiz_question_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_question_templates_name_unique" UNIQUE("name"),
	CONSTRAINT "quiz_question_templates_name_check" CHECK (btrim("name") <> ''),
	CONSTRAINT "quiz_question_templates_question_check" CHECK (btrim("question") <> '')
);
