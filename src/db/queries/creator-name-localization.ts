import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, creatorRoles, entryCreators, mediaItems, jobRuns, adminActivityLogs } from "@/db/schema";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";
import { canAiLocalizeCreatorName, hasPredominantlyCyrillicName, type CreatorNameLocalizationResponse, type CreatorNameLocalizationPayload } from "@/lib/creators/name-localization";
const eligible = () => and(eq(creators.nameRuProcessed, false), or(isNull(creators.nameRuSource), eq(creators.nameRuSource, "ai")));
export async function prepareCreatorNameLocalizationBatch(payload: CreatorNameLocalizationPayload, guard: SnapshotJobGuard) {
  return withSnapshotJobGuard(guard, async (tx) => {
    const rows = await tx.select({ id: creators.id, name: creators.name, updatedAt: creators.updatedAt }).from(creators)
      .where(and(eq(creators.typeId, sql `(select ${creatorTypes.id} from ${creatorTypes} where ${creatorTypes.code} = 'person')`), eligible(), payload.creatorIds ? inArray(creators.id, payload.creatorIds) : undefined))
      .orderBy(asc(creators.id)).limit(payload.batchSize).for("update");
    const alreadyRussianIds = rows.filter(row => hasPredominantlyCyrillicName(row.name)).map(row => row.id);
    if (alreadyRussianIds.length)
      await tx.update(creators).set({ nameRuProcessed: true, updatedAt: new Date() }).where(and(inArray(creators.id, alreadyRussianIds), eligible()));
    const batch = rows.filter(row => !hasPredominantlyCyrillicName(row.name));
    await tx.update(jobRuns).set({ payload: { ...payload, creatorIds: batch.map(row => row.id) } }).where(eq(jobRuns.id, guard.runId));
    return batch;
  });
}
export async function getCreatorNameLocalizationContext(ids: number[]) {
  if (!ids.length)
    return [];
  // Indexed per-person lateral LIMIT bounds relationship fan-out even for prolific creators.
  const rows = await db.execute<{
    id: number;
    role: string;
    title: string;
  }>(sql `
  select c.id, context.role, context.title from ${creators} c
  cross join lateral (
   select r.name as role, m.title from ${entryCreators} ec
   join ${creatorRoles} r on r.id = ec.role_id join ${mediaItems} m on m.id = ec.entry_id
   where ec.creator_id = c.id order by ec.role_id, ec.entry_id limit 3
  ) context where c.id in (${sql.join(ids.map(id => sql `${id}`), sql `, `)})
 `);
  return Array.from(rows);
}
export async function saveCreatorNameLocalizationBatch(input: {
  guard: SnapshotJobGuard;
  expected: {
    id: number;
    name: string;
    updatedAt: Date;
  }[];
  response: CreatorNameLocalizationResponse;
}) {
  return withSnapshotJobGuard(input.guard, async (tx) => {
    if (!input.expected.length)
      return;
    const rows = await tx.select().from(creators).where(inArray(creators.id, input.expected.map(row => row.id))).orderBy(asc(creators.id)).for("update");
    const logs: (typeof adminActivityLogs.$inferInsert)[] = [];
    for (const row of rows) {
      const expected = input.expected.find(person => person.id === row.id);
      const result = input.response.persons.find(person => person.id === row.id);
      if (!expected || !result || row.nameRuProcessed || !canAiLocalizeCreatorName(row) || row.name !== expected.name || row.updatedAt.getTime() !== expected.updatedAt.getTime())
        continue;
      const updatedAt = new Date();
      await tx.update(creators).set({ nameRuProcessed: true, ...(result.nameRu === null ? {} : { nameRu: result.nameRu, nameRuSource: "ai" as const }), updatedAt }).where(eq(creators.id, row.id));
      const previousName = row.nameRu ?? row.name;
      if (result.nameRu !== null && result.nameRu !== previousName) {
        logs.push({ action: "creator.name-localized", actorType: "system", entityType: "creator", entityId: row.id,
          entityLabel: result.nameRu, status: "success", severity: "info", createdAt: updatedAt,
          message: `Имя персоны локализовано: «${previousName}» → «${result.nameRu}». Источник: ИИ, запуск #${input.guard.runId}.`,
          metadata: { source: "ai", runId: input.guard.runId, originalName: row.name, previousName, nameRu: result.nameRu },
        });
      }
    }
    if (logs.length) await tx.insert(adminActivityLogs).values(logs);
  });
}
export async function resetCreatorNameLocalization(ids: number[], adminId?: number) {
  if (!ids.length)
    return [];
  return db.transaction(async (tx) => {
    const rows = await tx.update(creators).set({ nameRuProcessed: false, updatedAt: new Date() }).where(and(inArray(creators.id, ids), or(isNull(creators.nameRuSource), eq(creators.nameRuSource, "ai")), inArray(creators.typeId, db.select({ id: creatorTypes.id }).from(creatorTypes).where(eq(creatorTypes.code, "person"))))).returning({ id: creators.id });
    if (adminId !== undefined)
      await tx.insert(adminActivityLogs).values({ actorType: "admin", adminUserId: adminId, action: "creator.name-localization-reset", entityType: "creator", status: "success", message: "Запрошена повторная локализация имён персон.", metadata: { creatorIds: rows.map(row => row.id), skipped: ids.length - rows.length } });
    return rows;
  });
}
