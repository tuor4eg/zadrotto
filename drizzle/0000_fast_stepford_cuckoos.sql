CREATE TYPE "public"."media_type" AS ENUM('game', 'film', 'series', 'book', 'comic', 'anime', 'other');--> statement-breakpoint
CREATE TABLE "authors" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "franchises" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"media_type" "media_type" NOT NULL,
	"franchise_id" integer NOT NULL,
	"release_year" integer,
	"cover_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_media_item_id_author_id_unique" UNIQUE("media_item_id","author_id")
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "franchises" ("code", "title") VALUES
	('half-life', 'Half-Life'),
	('the-matrix', 'The Matrix'),
	('twin-peaks', 'Twin Peaks'),
	('dune', 'Dune'),
	('watchmen', 'Watchmen'),
	('evangelion', 'Evangelion'),
	('standalone', 'Standalone');--> statement-breakpoint
INSERT INTO "authors" ("code", "name") VALUES
	('pasha', 'Паша'),
	('sasha', 'Саша');--> statement-breakpoint
INSERT INTO "media_items" (
	"code",
	"title",
	"original_title",
	"media_type",
	"franchise_id",
	"release_year",
	"cover_url"
) VALUES
	(
		'half-life-2',
		'Half-Life 2',
		NULL,
		'game',
		(SELECT "id" FROM "franchises" WHERE "code" = 'half-life'),
		2004,
		NULL
	),
	(
		'the-matrix',
		'The Matrix',
		NULL,
		'film',
		(SELECT "id" FROM "franchises" WHERE "code" = 'the-matrix'),
		1999,
		NULL
	),
	(
		'twin-peaks-season-1',
		'Twin Peaks: Season 1',
		NULL,
		'series',
		(SELECT "id" FROM "franchises" WHERE "code" = 'twin-peaks'),
		1990,
		NULL
	),
	(
		'dune',
		'Dune',
		NULL,
		'book',
		(SELECT "id" FROM "franchises" WHERE "code" = 'dune'),
		1965,
		NULL
	),
	(
		'watchmen',
		'Watchmen',
		NULL,
		'comic',
		(SELECT "id" FROM "franchises" WHERE "code" = 'watchmen'),
		1986,
		NULL
	),
	(
		'neon-genesis-evangelion',
		'Neon Genesis Evangelion',
		'Shin Seiki Evangelion',
		'anime',
		(SELECT "id" FROM "franchises" WHERE "code" = 'evangelion'),
		1995,
		NULL
	),
	(
		'zadrotto-demo-disc',
		'Zadrotto Demo Disc',
		NULL,
		'other',
		(SELECT "id" FROM "franchises" WHERE "code" = 'standalone'),
		NULL,
		NULL
	);--> statement-breakpoint
INSERT INTO "ratings" ("media_item_id", "author_id", "score") VALUES
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'half-life-2'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		95
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'half-life-2'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		90
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'the-matrix'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		90
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'the-matrix'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		92
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'dune'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		92
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'dune'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		86
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'watchmen'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		88
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'watchmen'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		94
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'neon-genesis-evangelion'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		85
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'neon-genesis-evangelion'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		96
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'zadrotto-demo-disc'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		80
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'zadrotto-demo-disc'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		75
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'twin-peaks-season-1'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		87
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'twin-peaks-season-1'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		91
	);
