CREATE TABLE "creator_fields_fill_attempts" (
	"creator_id" integer NOT NULL,
	"field" text NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "creator_fields_fill_attempts_creator_id_field_pk" PRIMARY KEY("creator_id","field"),
	CONSTRAINT "creator_fields_fill_attempts_field_check" CHECK ("creator_fields_fill_attempts"."field" in ('birthDate', 'deathDate', 'foundedDate')),
	CONSTRAINT "creator_fields_fill_attempts_fingerprint_check" CHECK ("creator_fields_fill_attempts"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "creator_fields_fill_attempts" ADD CONSTRAINT "creator_fields_fill_attempts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;