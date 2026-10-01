import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { and, asc, eq, exists, gt, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { getExpiredAdminExports, markAdminExportExpired, markAdminExportFailed, markAdminExportReady, markAdminExportRunning } from "@/db/queries/admin-exports";
import { containsNormalizedSearchSql, normalizeSearchSql } from "@/db/search";
import { authors, franchises, mediaCarriers, mediaItemFranchises, mediaItemMetadata, mediaItems, mediaItemTitleAliases } from "@/db/schema";
import { deleteS3Object, uploadS3ObjectStream } from "@/lib/services/minio";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { createCsvRow, CSV_BOM } from "./csv";
import { normalizeSearchText } from "@/lib/search/normalize";
import { ADMIN_EXPORT_ENTITY_TYPES, ADMIN_EXPORT_FIELDS, parseAdminExportFields, type AdminExportEntityType } from "./model";

const BATCH_SIZE = 500;
const MAX_EXPORT_BYTES = 1024 * 1024 * 1024;

function mediaConditions(filters: Record<string, unknown>, afterId: number): SQL[] {
  const conditions: SQL[] = [gt(mediaItems.id, afterId)];
  if (filters.q) {
    const normalizedQuery = normalizeSearchText(String(filters.q));
    if (normalizedQuery) {
      const codePattern = `%-${normalizedQuery.replace(/\s+/g, "-")}-%`;
      conditions.push(or(
        containsNormalizedSearchSql(mediaItems.title, normalizedQuery),
        containsNormalizedSearchSql(mediaItems.originalTitle, normalizedQuery),
        sql`('-' || ${normalizeSearchSql(mediaItems.code)} || '-') like ${codePattern}`,
        exists(db.select({ id: mediaItemTitleAliases.id }).from(mediaItemTitleAliases).where(and(eq(mediaItemTitleAliases.mediaItemId, mediaItems.id), containsNormalizedSearchSql(mediaItemTitleAliases.value, normalizedQuery)))),
      ) as SQL);
    }
  }
  if (filters.authorId) conditions.push(eq(mediaItems.createdByAuthorId, Number(filters.authorId)));
  if (filters.mediaCarrierId) conditions.push(eq(mediaItems.mediaCarrierId, Number(filters.mediaCarrierId)));
  if (filters.mediaType && filters.mediaType !== "all") conditions.push(eq(mediaItems.mediaType, String(filters.mediaType)));
  if (filters.metadata === "missing") conditions.push(isNotNull(mediaItems.metadataAttemptedAt));
  if (filters.metadata === "missing" || filters.metadata === "absent") conditions.push(sql`not exists (select 1 from ${mediaItemMetadata} where ${mediaItemMetadata.mediaItemId} = ${mediaItems.id} and ${mediaItemMetadata.facts} <> '{}'::jsonb)`);
  return conditions;
}

async function getMediaBatch(filters: Record<string, unknown>, afterId: number) {
  return db.select({ id: mediaItems.id, code: mediaItems.code, title: mediaItems.title, originalTitle: mediaItems.originalTitle, description: mediaItems.description, mediaType: mediaItems.mediaType, carrier: mediaCarriers.name, releaseYear: mediaItems.releaseYear, coverUrl: mediaItems.coverUrl, publicationStatus: mediaItems.publicationStatus, author: authors.name, createdAt: mediaItems.createdAt, updatedAt: mediaItems.updatedAt })
    .from(mediaItems).leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId)).leftJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .where(and(...mediaConditions(filters, afterId))).orderBy(asc(mediaItems.id)).limit(BATCH_SIZE);
}

async function getMediaRelations(ids: number[]) {
  if (!ids.length) return { aliases: new Map<number, string[]>(), series: new Map<number, { code: string; title: string }[]>() };
  const [aliasRows, seriesRows] = await Promise.all([
    db.select({ id: mediaItemTitleAliases.mediaItemId, value: mediaItemTitleAliases.value }).from(mediaItemTitleAliases).where(inArray(mediaItemTitleAliases.mediaItemId, ids)).orderBy(asc(mediaItemTitleAliases.id)),
    db.select({ id: mediaItemFranchises.mediaItemId, code: franchises.code, title: franchises.title }).from(mediaItemFranchises).innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId)).where(inArray(mediaItemFranchises.mediaItemId, ids)).orderBy(asc(franchises.title)),
  ]);
  const aliases = new Map<number, string[]>(); const series = new Map<number, { code: string; title: string }[]>();
  for (const row of aliasRows) aliases.set(row.id, [...(aliases.get(row.id) ?? []), row.value]);
  for (const row of seriesRows) series.set(row.id, [...(series.get(row.id) ?? []), { code: row.code, title: row.title }]);
  return { aliases, series };
}

async function getSeriesBatch(filters: Record<string, unknown>, afterId: number) {
  const conditions: SQL[] = [gt(franchises.id, afterId)];
  if (filters.q) {
    const normalizedQuery = normalizeSearchText(String(filters.q));
    if (normalizedQuery) conditions.push(or(
      containsNormalizedSearchSql(franchises.title, normalizedQuery),
      containsNormalizedSearchSql(franchises.originalTitle, normalizedQuery),
      containsNormalizedSearchSql(franchises.code, normalizedQuery),
    ) as SQL);
  }
  const parent = db.$with("parent_export").as(db.select({ id: franchises.id, code: franchises.code, title: franchises.title }).from(franchises));
  return db.with(parent).select({ id: franchises.id, code: franchises.code, title: franchises.title, originalTitle: franchises.originalTitle, description: franchises.description, parentTitle: parent.title, parentCode: parent.code, publicationStatus: franchises.publicationStatus, author: authors.name, createdAt: franchises.createdAt, updatedAt: franchises.updatedAt, mediaItemsCount: sql<number>`(select count(*)::int from ${mediaItemFranchises} where ${mediaItemFranchises.franchiseId} = ${franchises.id})` })
    .from(franchises).leftJoin(parent, eq(parent.id, franchises.parentId)).leftJoin(authors, eq(authors.id, franchises.createdByAuthorId)).where(and(...conditions)).orderBy(asc(franchises.id)).limit(BATCH_SIZE);
}

async function writeChunk(stream: ReturnType<typeof createWriteStream>, chunk: string, state: { bytes: number }) {
  const bytes = Buffer.byteLength(chunk); state.bytes += bytes;
  if (state.bytes > MAX_EXPORT_BYTES) throw new Error("Экспорт превышает допустимый размер 1 ГБ.");
  if (!stream.write(chunk)) await once(stream, "drain");
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  await once(stream, "end");
  return hash.digest("hex");
}

export async function generateAdminExport(exportId: string) {
  const item = await markAdminExportRunning(exportId);
  if (!item || item.status === "ready") return;
  const directory = await mkdtemp(join(tmpdir(), "zadrotto-export-"));
  const filePath = join(directory, `${item.id}.csv`);
  try {
    if (!ADMIN_EXPORT_ENTITY_TYPES.includes(item.entityType as AdminExportEntityType)) throw new Error("Некорректный тип экспорта.");
    const entityType = item.entityType as AdminExportEntityType;
    const fields = parseAdminExportFields(entityType, item.fields);
    let maxAliases = 0;
    if (item.entityType === "media_items" && fields.includes("aliases")) {
      let afterId = 0;
      while (true) { const batch = await getMediaBatch(item.filters, afterId); if (!batch.length) break; const related = await getMediaRelations(batch.map((row) => row.id)); for (const values of related.aliases.values()) maxAliases = Math.max(maxAliases, values.length); afterId = batch.at(-1)!.id; }
      maxAliases = Math.max(1, maxAliases);
    }
    const stream = createWriteStream(filePath, { encoding: "utf8" }); const state = { bytes: 0 }; let rowCount = 0;
    await writeChunk(stream, CSV_BOM, state);
    const labels = new Map<string, string>(ADMIN_EXPORT_FIELDS[entityType].map((field) => [field.key, field.label]));
    const headers = fields.flatMap((field) => field === "aliases" ? Array.from({ length: maxAliases }, (_, index) => `Псевдоним ${index + 1}`) : [labels.get(field) ?? field]);
    await writeChunk(stream, createCsvRow(headers), state);
    let afterId = 0;
    while (true) {
      const batch = item.entityType === "media_items" ? await getMediaBatch(item.filters, afterId) : await getSeriesBatch(item.filters, afterId);
      if (!batch.length) break;
      const related = item.entityType === "media_items" ? await getMediaRelations(batch.map((row) => row.id)) : null;
      for (const row of batch) {
        const record = row as Record<string, unknown> & { id: number };
        const values = fields.flatMap((field) => {
          if (field === "aliases") return Array.from({ length: maxAliases }, (_, index) => related?.aliases.get(row.id)?.[index] ?? "");
          if (field === "seriesTitles") return [(related?.series.get(row.id) ?? []).map((value) => value.title).join(" | ")];
          if (field === "seriesCodes") return [(related?.series.get(row.id) ?? []).map((value) => value.code).join(" | ")];
          return [record[field] ?? ""];
        });
        await writeChunk(stream, createCsvRow(values), state); rowCount += 1;
      }
      afterId = batch.at(-1)!.id;
    }
    stream.end(); await once(stream, "finish");
    const fileStat = await stat(filePath); const payloadHash = await hashFile(filePath);
    const objectKey = `admin-exports/${item.id}.csv`;
    await uploadS3ObjectStream({ objectKey, body: createReadStream(filePath), contentLength: fileStat.size, contentType: "text/csv; charset=utf-8", payloadHash });
    await markAdminExportReady({ id: item.id, objectKey, rowCount, fileSize: fileStat.size });
    await logSystemActivity({ action: "data-export.ready", entityType: "data-export", entityLabel: item.id, message: "Экспорт данных сформирован.", metadata: { rowCount } });
  } catch (error) {
    await markAdminExportFailed(item.id);
    await logSystemActivity({ action: "data-export.failed", entityType: "data-export", entityLabel: item.id, message: "Экспорт данных завершился ошибкой.", status: "failure", severity: "warning" });
    throw error;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function cleanupAdminExports() {
  const expired = await getExpiredAdminExports();
  for (const item of expired) { if (item.objectKey) await deleteS3Object({ objectKey: item.objectKey }); await markAdminExportExpired(item.id); await logSystemActivity({ action: "data-export.expired", entityType: "data-export", entityLabel: item.id, message: "Истёкший файл экспорта удалён." }); }
  return expired.length;
}
