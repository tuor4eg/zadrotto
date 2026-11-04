CREATE TABLE "creator_relations" (
	"source_creator_id" integer NOT NULL,
	"target_creator_id" integer NOT NULL,
	"relation_type" text NOT NULL,
	CONSTRAINT "creator_relations_source_creator_id_target_creator_id_relation_type_pk" PRIMARY KEY("source_creator_id","target_creator_id","relation_type"),
	CONSTRAINT "creator_relations_distinct_check" CHECK ("creator_relations"."source_creator_id" <> "creator_relations"."target_creator_id"),
	CONSTRAINT "creator_relations_type_check" CHECK ("creator_relations"."relation_type" = 'pseudonym_of')
);
--> statement-breakpoint
CREATE TABLE "entry_creator_pseudonyms" (
	"entry_id" integer PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"role_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_relations" ADD CONSTRAINT "creator_relations_source_creator_id_creators_id_fk" FOREIGN KEY ("source_creator_id") REFERENCES "creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_relations" ADD CONSTRAINT "creator_relations_target_creator_id_creators_id_fk" FOREIGN KEY ("target_creator_id") REFERENCES "creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_pseudonyms" ADD CONSTRAINT "entry_creator_pseudonyms_entry_id_media_items_id_fk" FOREIGN KEY ("entry_id") REFERENCES "media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_pseudonyms" ADD CONSTRAINT "entry_creator_pseudonyms_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_pseudonyms" ADD CONSTRAINT "entry_creator_pseudonyms_role_id_creator_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "creator_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_relations_target_idx" ON "creator_relations" USING btree ("target_creator_id");--> statement-breakpoint
CREATE INDEX "entry_creator_pseudonyms_creator_idx" ON "entry_creator_pseudonyms" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "entry_creator_pseudonyms_role_idx" ON "entry_creator_pseudonyms" USING btree ("role_id");