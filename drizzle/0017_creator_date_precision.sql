ALTER TABLE "creators"
  ALTER COLUMN "birth_date" SET DATA TYPE text USING to_char("birth_date", 'YYYY-MM-DD'),
  ALTER COLUMN "death_date" SET DATA TYPE text USING to_char("death_date", 'YYYY-MM-DD');--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_birth_date_check" CHECK ("creators"."birth_date" ~ '^[0-9]{4}(-[0-9]{2}-[0-9]{2})?$' and left("creators"."birth_date", 4) <> '0000' and (length("creators"."birth_date") = 4 or pg_input_is_valid("creators"."birth_date", 'date')));--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_death_date_check" CHECK ("creators"."death_date" ~ '^[0-9]{4}(-[0-9]{2}-[0-9]{2})?$' and left("creators"."death_date", 4) <> '0000' and (length("creators"."death_date") = 4 or pg_input_is_valid("creators"."death_date", 'date')));
