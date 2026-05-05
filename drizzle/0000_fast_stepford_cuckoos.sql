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
	"original_title" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchises_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"media_type" "media_type" NOT NULL,
	"franchise_id" integer,
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
INSERT INTO "franchises" ("code", "title", "original_title", "description") VALUES
	('half-life', 'Half-Life', NULL, 'Игры о научном эксперименте, который распахнул дверь в чужой мир и изменил шутеры.'),
	('the-matrix', 'The Matrix', NULL, 'Киберпанковская история о реальности, симуляции и выборе красной таблетки.'),
	('twin-peaks', 'Twin Peaks', NULL, 'Телевизионная загадка маленького города, где бытовое быстро становится потусторонним.'),
	('dune', 'Dune', NULL, 'Пустынная сага о власти, пророчествах, специи и цене имперских амбиций.');--> statement-breakpoint
INSERT INTO "authors" ("code", "name") VALUES
	('pasha', 'Паша'),
	('sasha', 'Саша');--> statement-breakpoint
INSERT INTO "media_items" (
	"code",
	"title",
	"original_title",
	"description",
	"media_type",
	"franchise_id",
	"release_year",
	"cover_url"
) VALUES
	(
		'half-life-2',
		'Half-Life 2',
		NULL,
		'Побег через оккупированный город, где физика впервые ощущалась почти магией.',
		'game',
		(SELECT "id" FROM "franchises" WHERE "code" = 'half-life'),
		2004,
		NULL
	),
	(
		'the-matrix',
		'The Matrix',
		NULL,
		'Боевик о пробуждении из симуляции, который превратил философию в стильный экшен.',
		'film',
		(SELECT "id" FROM "franchises" WHERE "code" = 'the-matrix'),
		1999,
		NULL
	),
	(
		'twin-peaks-season-1',
		'Twin Peaks: Season 1',
		NULL,
		'Расследование смерти Лоры Палмер открывает странную душу тихого северного городка.',
		'series',
		(SELECT "id" FROM "franchises" WHERE "code" = 'twin-peaks'),
		1990,
		NULL
	),
	(
		'dune',
		'Dune',
		NULL,
		'Роман о песчаной планете Арракис, где религия и политика сплетаются вокруг специи.',
		'book',
		(SELECT "id" FROM "franchises" WHERE "code" = 'dune'),
		1965,
		NULL
	),
	(
		'dune-part-one',
		'Dune: Part One',
		NULL,
		'Первая часть новой экранизации: падение дома Атрейдесов и путь Пола в пустыню.',
		'film',
		(SELECT "id" FROM "franchises" WHERE "code" = 'dune'),
		2021,
		NULL
	),
	(
		'watchmen',
		'Watchmen',
		NULL,
		'Деконструкция супергероев, где маски не спасают мир от человеческих слабостей.',
		'comic',
		NULL,
		1986,
		NULL
	),
	(
		'neon-genesis-evangelion',
		'Neon Genesis Evangelion',
		'Shin Seiki Evangelion',
		'Подростки управляют гигантскими Евангелионами, пока конец света смотрит им в лицо.',
		'anime',
		NULL,
		1995,
		NULL
	),
	(
		'zadrotto-demo-disc',
		'Zadrotto Demo Disc',
		NULL,
		'Воображаемый демо-диск архива: место для будущих проб, находок и странных связей.',
		'other',
		NULL,
		NULL,
		NULL
	),
	(
		'half-life',
		'Half-Life',
		NULL,
		'Катастрофа в Черной Мезе, рассказанная почти без катсцен и привычных остановок.',
		'game',
		(SELECT "id" FROM "franchises" WHERE "code" = 'half-life'),
		1998,
		NULL
	),
	(
		'the-matrix-reloaded',
		'The Matrix Reloaded',
		NULL,
		'Продолжение, где мифология Матрицы расширяется через погони, выбор и архитекторов.',
		'film',
		(SELECT "id" FROM "franchises" WHERE "code" = 'the-matrix'),
		2003,
		NULL
	),
	(
		'twin-peaks-the-return',
		'Twin Peaks: The Return',
		NULL,
		'Позднее возвращение в Твин Пикс, больше похожее на сон о времени и телевидении.',
		'series',
		(SELECT "id" FROM "franchises" WHERE "code" = 'twin-peaks'),
		2017,
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
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'half-life'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		94
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'half-life'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		89
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'the-matrix-reloaded'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		82
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'the-matrix-reloaded'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		80
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'dune-part-one'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		84
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'dune-part-one'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		88
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'twin-peaks-the-return'),
		(SELECT "id" FROM "authors" WHERE "code" = 'pasha'),
		93
	),
	(
		(SELECT "id" FROM "media_items" WHERE "code" = 'twin-peaks-the-return'),
		(SELECT "id" FROM "authors" WHERE "code" = 'sasha'),
		95
	);
