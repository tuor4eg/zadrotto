import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CSV_BOM, createCsvRow, escapeCsvCell } from "../src/lib/admin-exports/csv";
import {
  ADMIN_EXPORT_FIELDS,
  MEDIA_METADATA_EXPORT_FIELDS,
  formatMetadataExportValue,
  getAvailableMetadataExportFields,
  getDefaultAdminExportFields,
  getMetadataExportField,
  getMetadataExportFieldKey,
  parseAdminExportFields,
} from "../src/lib/admin-exports/model";

const exportDialogSource = readFileSync(
  "src/app/admin/(protected)/exports/export-dialog.tsx",
  "utf8",
);
const exportActionsSource = readFileSync(
  "src/app/admin/(protected)/exports/actions.ts",
  "utf8",
);
const exportCreateSource = readFileSync("src/lib/admin-exports/create.ts", "utf8");
const exportGenerateSource = readFileSync("src/lib/admin-exports/generate.ts", "utf8");
const exportHistorySource = readFileSync(
  "src/app/admin/(protected)/exports/page.tsx",
  "utf8",
);
const exportDownloadRouteSource = readFileSync(
  "src/app/admin/(protected)/exports/[id]/download/route.ts",
  "utf8",
);

describe("admin export field catalog", () => {
  it("exposes the planned default media item fields", () => {
    assert.deepEqual(getDefaultAdminExportFields("media_items"), [
      "code",
      "title",
      "originalTitle",
      "aliases",
      "mediaType",
      "carrier",
      "releaseYear",
      "seriesTitles",
      "publicationStatus",
    ]);
  });

  it("exposes the planned default series fields", () => {
    assert.deepEqual(getDefaultAdminExportFields("series"), [
      "code",
      "title",
      "originalTitle",
      "parentTitle",
      "publicationStatus",
      "mediaItemsCount",
    ]);
  });

  it("keeps optional fields available without selecting them by default", () => {
    const optionalMediaFields = ADMIN_EXPORT_FIELDS.media_items
      .filter((field) => !field.default)
      .map((field) => field.key);
    const optionalSeriesFields = ADMIN_EXPORT_FIELDS.series
      .filter((field) => !field.default)
      .map((field) => field.key);

    assert.deepEqual(optionalMediaFields, [
      "description",
      "seriesCodes",
      "coverUrl",
      "author",
      "createdAt",
      "updatedAt",
    ]);
    assert.deepEqual(optionalSeriesFields, [
      "description",
      "parentCode",
      "author",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("accepts known fields, preserves their order, and removes duplicates", () => {
    assert.deepEqual(parseAdminExportFields("media_items", ["title", "code", "title"]), [
      "title",
      "code",
    ]);
  });

  it("rejects empty and unknown field selections", () => {
    assert.throws(() => parseAdminExportFields("series", []), /Выберите хотя бы одно поле/);
    assert.throws(
      () => parseAdminExportFields("series", ["title", "internalId"]),
      /неизвестное поле экспорта/,
    );
  });

  it("offers common metadata for mixed selections and type metadata for one selection", () => {
    assert.deepEqual(getAvailableMetadataExportFields([]).map((field) => field.key), ["genres"]);
    assert.deepEqual(getAvailableMetadataExportFields(["film", "series"]).map((field) => field.key), ["genres"]);
    assert.deepEqual(getAvailableMetadataExportFields(["game"]).map((field) => field.key), [
      "genres",
      "platforms",
      "developers",
      "publishers",
    ]);
  });

  it("keeps technical provider identifiers outside the metadata registry", () => {
    const keys = new Set<string>(MEDIA_METADATA_EXPORT_FIELDS.map((field) => field.key));
    assert.equal(keys.has("universeId"), false);
    assert.equal(keys.has("rootPlaceId"), false);
    assert.equal(keys.has("creatorId"), false);
  });

  it("validates metadata fields against the selected media type", () => {
    assert.deepEqual(
      parseAdminExportFields("media_items", ["title", "metadata.genres", "metadata.platforms"], ["game"]),
      ["title", "metadata.genres", "metadata.platforms"],
    );
    assert.throws(
      () => parseAdminExportFields("media_items", ["title", "metadata.platforms"], ["film"]),
      /неизвестное поле экспорта/,
    );
    assert.throws(
      () => parseAdminExportFields("series", ["title", "metadata.genres"]),
      /неизвестное поле экспорта/,
    );
  });

  it("formats valid metadata values and leaves invalid values empty", () => {
    const genres = getMetadataExportField(getMetadataExportFieldKey("genres"));
    const runtime = getMetadataExportField(getMetadataExportFieldKey("runtimeMinutes"));
    assert.ok(genres);
    assert.ok(runtime);
    assert.equal(formatMetadataExportValue(genres, { genres: ["Drama", " ", 42, "Comedy"] }), "Drama | Comedy");
    assert.equal(formatMetadataExportValue(runtime, { runtimeMinutes: 125 }), 125);
    assert.equal(formatMetadataExportValue(runtime, { runtimeMinutes: "125" }), "");
    assert.equal(formatMetadataExportValue(genres, null), "");
  });
});

describe("admin CSV serialization", () => {
  it("uses a UTF-8 BOM constant and CRLF row endings", () => {
    assert.equal(CSV_BOM, "\uFEFF");
    assert.equal(createCsvRow(["Код", "Название"]), "Код,Название\r\n");
  });

  it("serializes empty values and dates predictably", () => {
    const createdAt = new Date("2026-09-28T10:11:12.000Z");

    assert.equal(createCsvRow([null, undefined, createdAt]), ",,2026-09-28T10:11:12.000Z\r\n");
  });

  it("quotes commas, quotes, and line breaks according to RFC 4180", () => {
    assert.equal(escapeCsvCell("Альфа, Бета"), '"Альфа, Бета"');
    assert.equal(escapeCsvCell('Название "в кавычках"'), '"Название ""в кавычках"""');
    assert.equal(escapeCsvCell("Первая\nВторая"), '"Первая\nВторая"');
  });

  it("neutralizes spreadsheet formulas before applying CSV quoting", () => {
    for (const value of ["=1+1", "+SUM(A1:A2)", "-10+20", "@command", "\tformula", "\rformula"]) {
      assert.equal(escapeCsvCell(value), value.includes("\r") ? `"'${value}"` : `'${value}`);
    }

    assert.equal(escapeCsvCell("safe text"), "safe text");
  });
});

describe("admin export UI contracts", () => {
  it("submits a frozen entity, filter, sort, and field selection", () => {
    assert.match(exportDialogSource, /action=\{createAdminExportAction\}/);
    assert.match(exportDialogSource, /name="entityType" value=\{entityType\}/);
    assert.match(exportDialogSource, /name="filters" value=\{JSON\.stringify\(filters\)\}/);
    assert.match(exportDialogSource, /name="sort" value=\{sort\}/);
    assert.match(exportDialogSource, /name="fields" value=\{field\.key\}/);
    assert.match(exportDialogSource, /defaultChecked=\{defaults\.has\(field\.key\)\}/);
    assert.match(exportDialogSource, /<span>Метаданные<\/span>/);
    assert.match(exportDialogSource, /metadataToggleRef\.current\.indeterminate = someMetadataSelected/);
    assert.match(exportDialogSource, /getAvailableMetadataExportFields\(selectedMediaTypes\)/);
  });

  it("explains that all matching rows are exported asynchronously", () => {
    assert.match(exportDialogSource, /все строки текущей выборки: \{totalCount\}/);
    assert.match(exportDialogSource, /Файл будет сформирован фоновой задачей/);
    assert.match(exportDialogSource, /истории экспортов/);
  });

  it("authenticates export creation and validates the entity type server-side", () => {
    assert.match(exportActionsSource, /const admin = await requireAdminUser\(\)/);
    assert.match(exportActionsSource, /ADMIN_EXPORT_ENTITY_TYPES\.includes/);
    assert.match(exportActionsSource, /fields: formData\.getAll\("fields"\)/);
    assert.match(exportActionsSource, /adminId: admin\.id/);
  });

  it("validates metadata after normalizing filters and reads facts during generation", () => {
    assert.match(
      exportCreateSource,
      /const filters = normalizeFilters[\s\S]*const mediaTypes = filters\.mediaType[\s\S]*parseAdminExportFields\(input\.entityType, input\.fields, mediaTypes\)/,
    );
    assert.match(exportGenerateSource, /leftJoin\(mediaItemMetadata, eq\(mediaItemMetadata\.mediaItemId, mediaItems\.id\)\)/);
    assert.match(exportGenerateSource, /formatMetadataExportValue\(metadataField, record\.metadataFacts/);
  });

  it("redirects successful creation and retry to export history", () => {
    assert.match(exportActionsSource, /redirect\("\/admin\/exports\?created=1"\)/);
    assert.match(exportActionsSource, /retryAdminExport\(\{ adminId: admin\.id/);
    assert.match(exportActionsSource, /redirect\("\/admin\/exports\?retried=1"\)/);
  });

  it("scopes export history and retries to the current administrator", () => {
    assert.match(exportHistorySource, /requireAdminUser\(\)/);
    assert.match(exportHistorySource, /listAdminExports\(\{ adminId: admin\.id/);
    assert.match(exportHistorySource, /action=\{retryAdminExportAction\}/);
    assert.match(exportHistorySource, /name="exportId" value=\{item\.id\}/);
  });

  it("only offers downloads for ready, unexpired exports", () => {
    assert.match(
      exportHistorySource,
      /item\.status === "ready" && item\.expiresAt > new Date\(\)/,
    );
    assert.match(exportHistorySource, /`\/admin\/exports\/\$\{item\.id\}\/download`/);
  });

  it("protects downloads by owner, readiness, object presence, and expiry", () => {
    assert.match(exportDownloadRouteSource, /requireAdminUser\(\)/);
    assert.match(exportDownloadRouteSource, /getAdminExportForOwner\(id, admin\.id\)/);
    assert.match(exportDownloadRouteSource, /item\.status !== "ready"/);
    assert.match(exportDownloadRouteSource, /!item\.objectKey/);
    assert.match(exportDownloadRouteSource, /item\.expiresAt <= new Date\(\)/);
    assert.match(exportDownloadRouteSource, /if \(!stored\?\.body\).*status: 404/);
  });

  it("serves CSV downloads as private attachments", () => {
    assert.match(exportDownloadRouteSource, /"Content-Type": "text\/csv; charset=utf-8"/);
    assert.match(exportDownloadRouteSource, /"Content-Disposition": `attachment; filename="\$\{filename\}"`/);
    assert.match(exportDownloadRouteSource, /"Cache-Control": "private, no-store"/);
  });
});
