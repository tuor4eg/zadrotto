ALTER TABLE "level_thresholds" ADD COLUMN "name" text;
--> statement-breakpoint
UPDATE "level_thresholds"
SET "name" = CASE "level"
  WHEN 1 THEN 'Новичок с мануалом'
  WHEN 2 THEN 'Искатель пасхалок'
  WHEN 3 THEN 'Укротитель бэклога'
  WHEN 4 THEN 'Хранитель канона'
  WHEN 5 THEN 'Повелитель спойлеров'
  WHEN 6 THEN 'Архивариус мультивселенной'
  WHEN 7 THEN 'Босс секретного уровня'
  WHEN 8 THEN 'Легенда локального кооператива'
  WHEN 9 THEN 'Финальный коллекционер'
  WHEN 10 THEN 'Хранитель Гикотеки'
  ELSE 'Уровень ' || "level"::text
END;
--> statement-breakpoint
ALTER TABLE "level_thresholds" ALTER COLUMN "name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "level_thresholds" ADD CONSTRAINT "level_thresholds_name_check"
  CHECK (char_length(btrim("name")) between 1 and 80);
