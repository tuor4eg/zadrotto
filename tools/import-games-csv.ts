import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

import { slugifyCodePart } from "@/lib/generated-code";

type CliArgs = {
  author: string;
  file: string;
  out: string;
};

type GameRow = {
  completedYear: number;
  title: string;
  releaseYear: number;
  score: number;
  coop: string;
  franchiseTitle: string;
  rowNumber: number;
};

const DEFAULT_OUT = "drizzle/0001_import_games_catalog.sql";

function readCliArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const hasInlineValue = arg.includes("=");
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = hasInlineValue ? inlineValue : argv[index + 1];

    if (!hasInlineValue) {
      index += 1;
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    args.set(rawKey, value);
  }

  const file = args.get("file")?.trim();
  const author = args.get("author")?.trim();
  const out = args.get("out")?.trim() || DEFAULT_OUT;

  if (!file || !author) {
    throw new Error(
      `Usage: tsx tools/import-games-csv.ts --file Игори.csv --author author-code [--out ${DEFAULT_OUT}]`,
    );
  }

  return { author, file, out };
}

function parseInteger(value: string, fieldName: string, rowNumber: number) {
  const parsed = Number(value.trim());

  if (!Number.isInteger(parsed)) {
    throw new Error(`Row ${rowNumber}: invalid ${fieldName}`);
  }

  return parsed;
}

function isHeader(row: string[]) {
  return row.some((field) => field.trim().toLowerCase() === "название");
}

function mapRows(rows: string[][]): GameRow[] {
  return rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => row.some((field) => field.trim()))
    .filter(({ row }) => !isHeader(row))
    .map(({ row, rowNumber }) => {
      if (row.length !== 6) {
        throw new Error(`Row ${rowNumber}: expected 6 columns, got ${row.length}`);
      }

      const title = row[1].trim();

      if (!title) {
        throw new Error(`Row ${rowNumber}: title is empty`);
      }

      const score = parseInteger(row[3], "score", rowNumber);

      if (score < 1 || score > 10) {
        throw new Error(`Row ${rowNumber}: score must be between 1 and 10`);
      }

      return {
        completedYear: parseInteger(row[0], "completed year", rowNumber),
        title,
        releaseYear: parseInteger(row[2], "release year", rowNumber),
        score,
        coop: row[4].trim(),
        franchiseTitle: row[5].trim(),
        rowNumber,
      };
    });
}

function parseGamesCsv(text: string) {
  const parsedCsv = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });

  if (parsedCsv.errors.length > 0) {
    const firstError = parsedCsv.errors[0];

    throw new Error(`CSV parse error on row ${firstError.row}: ${firstError.message}`);
  }

  return mapRows(parsedCsv.data);
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableString(value: string) {
  return value ? sqlString(value) : "null";
}

function buildCode(type: "game" | "series", title: string, usedCodes: Set<string>) {
  const base = `${type}-${slugifyCodePart(title)}`;
  let code = base;
  let suffix = 2;

  while (usedCodes.has(code)) {
    code = `${base}-${suffix}`;
    suffix += 1;
  }

  usedCodes.add(code);
  return code;
}

function enrichRows(rows: GameRow[]) {
  const usedGameCodes = new Set<string>();
  const usedFranchiseCodes = new Set<string>();
  const franchiseCodes = new Map<string, string>();

  return rows.map((row) => {
    if (row.franchiseTitle && !franchiseCodes.has(row.franchiseTitle)) {
      franchiseCodes.set(
        row.franchiseTitle,
        buildCode("series", row.franchiseTitle, usedFranchiseCodes),
      );
    }

    return {
      ...row,
      mediaCode: buildCode("game", row.title, usedGameCodes),
      franchiseCode: row.franchiseTitle ? franchiseCodes.get(row.franchiseTitle)! : "",
    };
  });
}

function buildMigrationSql(input: {
  authorCode: string;
  rows: ReturnType<typeof enrichRows>;
}) {
  const values = input.rows
    .map((row) => {
      const description = `Проходил в ${row.completedYear}${row.coop ? ", в коопе" : ""}`;

      return [
        row.rowNumber,
        row.completedYear,
        sqlString(row.title),
        row.releaseYear,
        row.score * 10,
        sqlNullableString(row.coop),
        sqlNullableString(row.franchiseTitle),
        sqlString(row.mediaCode),
        sqlNullableString(row.franchiseCode),
        sqlString(description),
      ].join(", ");
    })
    .map((value) => `  (${value})`)
    .join(",\n");

  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM authors WHERE code = ${sqlString(input.authorCode)}) THEN
    RAISE EXCEPTION 'Author ${input.authorCode} not found';
  END IF;
END $$;
--> statement-breakpoint
WITH imported_games(
  row_number,
  completed_year,
  title,
  release_year,
  score,
  coop,
  franchise_title,
  media_code,
  franchise_code,
  description
) AS (
VALUES
${values}
),
first_imported_games AS (
  SELECT DISTINCT ON (title)
    row_number,
    completed_year,
    title,
    release_year,
    score,
    coop,
    franchise_title,
    media_code,
    franchise_code,
    description
  FROM imported_games
  ORDER BY title, row_number
),
last_imported_game_ratings AS (
  SELECT DISTINCT ON (title)
    title,
    score
  FROM imported_games
  ORDER BY title, row_number DESC
),
import_author AS (
  SELECT id
  FROM authors
  WHERE code = ${sqlString(input.authorCode)}
),
imported_franchises AS (
  SELECT DISTINCT ON (franchise_title)
    franchise_title AS title,
    franchise_code AS code
  FROM first_imported_games
  WHERE franchise_title IS NOT NULL
  ORDER BY franchise_title, row_number
),
existing_franchises AS (
  SELECT franchises.id, franchises.title
  FROM franchises
  INNER JOIN imported_franchises ON imported_franchises.title = franchises.title
),
created_franchises AS (
  INSERT INTO franchises (code, title, original_title, description)
  SELECT code, title, NULL, NULL
  FROM imported_franchises
  WHERE NOT EXISTS (SELECT 1 FROM existing_franchises WHERE existing_franchises.title = imported_franchises.title)
  ON CONFLICT (code) DO NOTHING
  RETURNING id, title
),
resolved_franchises AS (
  SELECT id, title FROM existing_franchises
  UNION ALL
  SELECT id, title FROM created_franchises
),
resolved_games AS (
  SELECT
    first_imported_games.*,
    resolved_franchises.id AS franchise_id,
    import_author.id AS author_id
  FROM first_imported_games
  CROSS JOIN import_author
  LEFT JOIN resolved_franchises ON resolved_franchises.title = first_imported_games.franchise_title
),
existing_media_items AS (
  SELECT media_items.id, media_items.title
  FROM media_items
  INNER JOIN resolved_games ON resolved_games.title = media_items.title
),
created_media_items AS (
  INSERT INTO media_items (
    code,
    title,
    original_title,
    description,
    media_type,
    franchise_id,
    release_year,
    cover_url,
    created_by_author_id,
    publication_status
  )
  SELECT
    resolved_games.media_code,
    resolved_games.title,
    NULL,
    resolved_games.description,
    'game',
    resolved_games.franchise_id,
    resolved_games.release_year,
    NULL,
    resolved_games.author_id,
    'published'
  FROM resolved_games
  WHERE NOT EXISTS (SELECT 1 FROM existing_media_items WHERE existing_media_items.title = resolved_games.title)
  ON CONFLICT (code) DO NOTHING
  RETURNING id, title
),
updated_media_items AS (
  UPDATE media_items
  SET
    description = COALESCE(media_items.description, resolved_games.description),
    release_year = COALESCE(media_items.release_year, resolved_games.release_year),
    franchise_id = COALESCE(media_items.franchise_id, resolved_games.franchise_id),
    updated_at = now()
  FROM resolved_games
  WHERE media_items.title = resolved_games.title
    AND (
      media_items.description IS NULL
      OR media_items.release_year IS NULL
      OR (media_items.franchise_id IS NULL AND resolved_games.franchise_id IS NOT NULL)
  )
  RETURNING media_items.id
),
resolved_media_items AS (
  SELECT id, title FROM existing_media_items
  UNION ALL
  SELECT id, title FROM created_media_items
),
rating_targets AS (
  SELECT
    resolved_media_items.id AS media_item_id,
    import_author.id AS author_id,
    last_imported_game_ratings.score AS score
  FROM last_imported_game_ratings
  CROSS JOIN import_author
  INNER JOIN resolved_media_items ON resolved_media_items.title = last_imported_game_ratings.title
)
INSERT INTO ratings (media_item_id, author_id, score)
SELECT media_item_id, author_id, score
FROM rating_targets
ON CONFLICT (media_item_id, author_id) DO UPDATE
SET
  score = excluded.score,
  updated_at = now();
`;
}

async function generateImportMigration(args: CliArgs) {
  const text = await readFile(args.file, "utf8");
  const rows = parseGamesCsv(text);

  if (rows.length === 0) {
    throw new Error("CSV contains no rows to import");
  }

  const sql = buildMigrationSql({
    authorCode: args.author,
    rows: enrichRows(rows),
  });

  await writeFile(args.out, sql);

  return {
    out: path.relative(process.cwd(), args.out),
    rows: rows.length,
    uniqueTitles: new Set(rows.map((row) => row.title)).size,
    franchises: new Set(rows.map((row) => row.franchiseTitle).filter(Boolean)).size,
  };
}

generateImportMigration(readCliArgs(process.argv.slice(2)))
  .then((stats) => {
    console.log(`Generated ${stats.out}`);
    console.log(`Rows: ${stats.rows}`);
    console.log(`Unique titles: ${stats.uniqueTitles}`);
    console.log(`Franchises: ${stats.franchises}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
