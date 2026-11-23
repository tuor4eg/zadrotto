import "server-only";
import { parseTagTitle } from "@/lib/tags/model";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { entrySources } from "@/db/schema";
import { classificationMigrationRuns } from "@/db/classification-migration-schema";
import type { DbTransaction } from "@/db/transaction";
import { lockClassificationMutations } from "@/db/queries/classification-lock";
import { publicTagMediaItemIdsSql } from "@/db/queries/tag-membership";
import { guardSnapshotJob, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { createJobRun } from "@/db/queries/jobs";
import { getAchievementMechanic } from "@/lib/achievements/catalog";
import { classificationBlockers, classificationHash, classificationRollbackHash, draftClassificationManifest, parseClassificationManifest, publishedMembership, type ClassificationManifest, type ClassificationSnapshot, type RawRow } from "@/lib/classification-migration/model";

const TABLES = ["franchises", "media_item_franchises", "media_item_franchise_removal_requests", "genres", "achievements", "tags", "media_item_tags"] as const;
type MigrationRun = typeof classificationMigrationRuns.$inferSelect;

async function snapshot(tx: DbTransaction): Promise<ClassificationSnapshot> {
  const result = {} as ClassificationSnapshot;
  // These names are compile-time constants, never manifest/request identifiers.
  for (const table of TABLES) {
    const rows = await tx.execute<{ row: RawRow }>(sql`select to_jsonb(t) as row from ${sql.identifier(table)} t order by to_jsonb(t)::text`);
    result[table] = rows.map(row => row.row);
  }
  result.systemAuthors = (await tx.execute<{ row: RawRow }>(sql`select jsonb_build_object('id',id) as row from authors where is_system order by id`)).map(row => row.row);
  result.archiveSettings = (await tx.execute<{ row: RawRow }>(sql`select to_jsonb(t) as row from archive_settings t order by id`)).map(row => row.row);
  result.providerLinks = Array.from(await tx.execute<RawRow>(sql`select * from provider_snapshot_links where entity_type in ('series','franchise') order by entity_type,entity_id,snapshot_id,purpose`));
  result.foreignKeys = Array.from(await tx.execute<RawRow>(sql`
    select c.conname, cl.relname as table_name, target.relname as target_table, c.confdeltype as delete_action,
      array(select att.attname::text from unnest(c.conkey) with ordinality key(attnum,position)
        join pg_attribute att on att.attrelid=c.conrelid and att.attnum=key.attnum order by key.position) as column_names,
      array(select att.attname::text from unnest(c.confkey) with ordinality key(attnum,position)
        join pg_attribute att on att.attrelid=c.confrelid and att.attnum=key.attnum order by key.position) as target_columns,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c inner join pg_class cl on cl.oid=c.conrelid inner join pg_class target on target.oid=c.confrelid
    where c.contype='f' and c.confrelid in ('franchises'::regclass,'media_item_franchises'::regclass)
    order by cl.relname,c.conname
  `));
  return result;
}

/** Freeze both classification and progress sources for a coherent comparison, including direct SQL writers. */
async function lockMigrationTables(tx: DbTransaction) {
  await lockClassificationMutations(tx);
  await tx.execute(sql`lock table achievement_levels,achievements,archive_settings,authors,contributions,franchises,genres,
    media_item_franchise_removal_requests,media_item_franchises,media_item_tags,media_items,
    provider_snapshot_links,ratings,tags,user_achievements,entry_sources in share row exclusive mode`);
}

async function migrationBlockers(tx: DbTransaction, state: ClassificationSnapshot, manifest: ClassificationManifest) {
  const blockers = classificationBlockers(state, manifest);
  const themeIds = manifest.series.filter((row) => row.group === "tag").map((row) => row.id);
  if (themeIds.length) {
    const usedSeries = await tx.selectDistinct({ id: entrySources.sourceSeriesId }).from(entrySources)
      .where(inArray(entrySources.sourceSeriesId, themeIds)).orderBy(entrySources.sourceSeriesId);
    for (const series of usedSeries) {
      blockers.push(`Серия #${series.id} указана как первоисточник записи. Измените эту связь перед переносом серии в тег.`);
    }
  }
  return blockers;
}

async function evidence(tx: DbTransaction, state: ClassificationSnapshot) {
  // Include retained ancestors too: changing a parent can change their achievement membership.
  const affected = state.achievements.filter(row => {
    const params = row.params as RawRow;
    return params.seriesId !== undefined || params.tagId !== undefined;
  });
  const membership: Record<string, number[]> = {};
  const published = await tx.execute<{ id: number; media_type: string }>(sql`select id,media_type from media_items where publication_status='published' order by id`);
  for (const achievement of affected) {
    const params = achievement.params as RawRow;
    const ids = params.seriesId !== undefined ? publishedMembership(state, Number(params.seriesId))
      : (await tx.execute<{ media_item_id: number }>(publicTagMediaItemIdsSql(sql`${Number(params.tagId)}`))).map(row => row.media_item_id);
    const allowed = new Set(ids);
    membership[String(achievement.id)] = published.filter(row => allowed.has(row.id) && (params.mediaType === undefined || params.mediaType === row.media_type)).map(row => row.id);
  }
  const authorIds = (await tx.execute<{ id: number }>(sql`select id from authors order by id`)).map(row => row.id);
  const progress: { achievementId: number; authorId: number; value: number }[] = [];
  const mechanics = [...new Set(affected.map(row => String(row.mechanic)))];
  for (const code of mechanics) {
    const mechanic = getAchievementMechanic(code);
    if (!mechanic) throw new Error(`Неизвестная механика ачивки: ${code}.`);
    const instances = affected.filter(row => row.mechanic === code).map(row => ({ achievementId: Number(row.id), params: mechanic.parseParams(row.params) }));
    for (let offset = 0; offset < authorIds.length; offset += 200) {
      const rows = await mechanic.evaluateBatch({ tx, authorIds: authorIds.slice(offset, offset + 200), instances });
      progress.push(...rows.filter(row => row.value !== 0));
    }
  }
  progress.sort((a, b) => a.achievementId - b.achievementId || a.authorId - b.authorId);
  return { membership, progress };
}

async function inventory(tx: DbTransaction) {
  const state = await snapshot(tx);
  const proof = await evidence(tx, state);
  return { state, proof, hash: classificationHash({ state, proof }) };
}

export async function getClassificationInventory() {
  return db.transaction(async tx => {
    await lockMigrationTables(tx);
    const current = await inventory(tx);
    return { ...current, manifest: draftClassificationManifest(current.state) };
  });
}

export async function createClassificationPreview(value: unknown, adminId: number, expectedHash?: string) {
  const manifest = parseClassificationManifest(value);
  return db.transaction(async tx => {
    await lockMigrationTables(tx);
    const current = await inventory(tx);
    if (expectedHash !== undefined && expectedHash !== current.hash) throw new Error("Данные изменились. Откройте дерево заново и проверьте выбор.");
    const blockers = await migrationBlockers(tx, current.state, manifest);
    const themes = manifest.series.filter(row => row.group === "tag");
    const decisions = new Map(manifest.series.map(row => [row.id, row]));
    const plannedState: ClassificationSnapshot = { ...current.state,
      franchises: current.state.franchises.filter(row => decisions.get(Number(row.id))?.group !== "tag").map(row => ({ ...row, parent_id: decisions.get(Number(row.id))?.parentId ?? null })),
      media_item_franchises: current.state.media_item_franchises.filter(row => decisions.get(Number(row.franchise_id))?.group !== "tag"),
    };
    const plannedMembership: Record<string, number[]> = {};
    const matchedMembership = new Map<number, number[]>();
    for (const theme of themes.filter(theme => theme.tagId !== undefined)) {
      const tagId = theme.tagId!;
      if (matchedMembership.has(tagId)) continue;
      const existingIds = (await tx.execute<{ media_item_id: number }>(publicTagMediaItemIdsSql(sql`${tagId}`))).map(row => row.media_item_id);
      const convertedIds = themes.filter(candidate => candidate.tagId === tagId).flatMap(candidate => publishedMembership(current.state, candidate.id));
      matchedMembership.set(tagId, [...new Set([...existingIds, ...convertedIds])].sort((a, b) => a - b));
    }
    for (const achievement of current.state.achievements) {
      const params = achievement.params as RawRow;
      if (params.seriesId === undefined && params.tagId === undefined) continue;
      const key = String(achievement.id);
      // Conversion flattens exactly the old branch; existing tags are unchanged.
      const theme = params.seriesId === undefined ? undefined : decisions.get(Number(params.seriesId));
      const ids = params.seriesId === undefined
        ? matchedMembership.get(Number(params.tagId)) ?? current.proof.membership[key]
        : theme?.group === "tag"
          ? theme.tagId === undefined ? current.proof.membership[key] : matchedMembership.get(theme.tagId)!
          : publishedMembership(plannedState, Number(params.seriesId));
      // A retained branch can only contain media already in some published source;
      // ask the same publication/type filter as the runtime evidence.
      const rows = await tx.execute<{ id: number }>(sql`select id from media_items where publication_status='published'
        and id in (select value::integer from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
        and ${params.mediaType === undefined ? sql`true` : sql`media_type=${String(params.mediaType)}`} order by id`);
      plannedMembership[key] = rows.map(row => row.id);
      if (classificationHash(plannedMembership[key]) !== classificationHash(current.proof.membership[key])) blockers.push(`План меняет членство ачивки #${achievement.id}; требуется исправить решения о родителях.`);
    }
    const preview = {
      blockers,
      inventory: current.state,
      evidence: current.proof,
      plannedEvidence: { membership: plannedMembership, progress: blockers.length === 0 ? current.proof.progress : null },
      assignments: themes.map(row => ({ seriesId: row.id, mediaItemIds: publishedMembership(current.state, row.id) })),
      tagMappings: themes.map(row => ({ seriesId: row.id, existingTagId: row.tagId ?? null, code: row.tagId === undefined ? current.state.franchises.find(series => series.id === row.id)?.code : current.state.tags.find(tag => tag.id === row.tagId)?.code, title: row.tagId === undefined ? current.state.franchises.find(series => series.id === row.id)?.title : current.state.tags.find(tag => tag.id === row.tagId)?.title })),
      dependencies: {
        pendingLinks: current.state.media_item_franchises.filter(row => row.publication_status !== "published"),
        removalRequests: current.state.media_item_franchise_removal_requests,
        genreReplacements: current.state.genres.filter(row => row.replacement_franchise_id != null),
        achievements: current.state.achievements.filter(row => (row.params as RawRow).seriesId !== undefined),
        providerLinks: current.state.providerLinks,
        foreignKeys: current.state.foreignKeys,
      },
    };
    const [run] = await tx.insert(classificationMigrationRuns).values({ manifest, beforeSnapshot: current.state, preview, previewHash: classificationHash({ manifest, currentHash: current.hash }), createdByAdminId: adminId }).returning();
    return run;
  });
}

export async function listClassificationMigrations() {
  return db.select({ id: classificationMigrationRuns.id, status: classificationMigrationRuns.status, createdAt: classificationMigrationRuns.createdAt })
    .from(classificationMigrationRuns).orderBy(desc(classificationMigrationRuns.createdAt)).limit(30);
}

export async function getClassificationMigration(id: string) {
  return (await db.select().from(classificationMigrationRuns).where(eq(classificationMigrationRuns.id, id)).limit(1))[0] ?? null;
}

/** Resolve a retired thematic URL only while its durable journal remains applied. */
export async function getMigratedSeriesTagCode(seriesCode: string): Promise<string | null> {
  const [row] = await db.execute<{ code: string }>(sql`
    select tag.code from classification_migration_runs migration
    cross join lateral jsonb_array_elements(migration.before_snapshot->'franchises') previous_series
    inner join lateral jsonb_array_elements(migration.manifest->'series') decision
      on decision->'id'=previous_series->'id' and decision->>'group'='tag'
    inner join lateral jsonb_array_elements(migration.after_snapshot->'tags') recorded_tag
      on (case when decision ? 'tagId' then recorded_tag->'id'=decision->'tagId' else recorded_tag->>'code'=previous_series->>'code' end)
    inner join tags tag on tag.id=(recorded_tag->>'id')::int
    where migration.status='applied' and previous_series->>'code'=${seriesCode}
      and not exists(select 1 from franchises current_series where current_series.code=${seriesCode})
    order by migration.applied_at desc limit 1
  `);
  return row?.code ?? null;
}

async function enqueue(tx: DbTransaction, run: MigrationRun, type: "classification.apply" | "classification.rollback", adminId: number) {
  return createJobRun({ type, payload: { migrationId: run.id, previewHash: run.previewHash }, createdByAdminId: adminId, source: "manual", maxAttempts: 1, retryBaseSeconds: 60, retryMaxSeconds: 60, timeoutSeconds: 3600 }, new Date(), tx);
}

export async function approveClassificationMigration(id: string, previewHash: string, adminId: number) {
  return db.transaction(async tx => {
    await lockMigrationTables(tx);
    const [run] = await tx.select().from(classificationMigrationRuns).where(eq(classificationMigrationRuns.id, id)).for("update");
    if (!run || run.status !== "preview" || run.previewHash !== previewHash) throw new Error("Предпросмотр не найден или уже подтверждён.");
    const current = await inventory(tx);
    if (classificationHash({ manifest: run.manifest, currentHash: current.hash }) !== previewHash) throw new Error("Данные изменились. Создайте новый предпросмотр.");
    const blockers = [...await migrationBlockers(tx, current.state, run.manifest), ...((run.preview.blockers ?? []) as string[])];
    if (blockers.length) throw new Error(blockers.join(" "));
    await tx.update(classificationMigrationRuns).set({ status: "approved", approvedAt: new Date(), approvedByAdminId: adminId }).where(eq(classificationMigrationRuns.id, id));
    return enqueue(tx, run, "classification.apply", adminId);
  });
}

export async function requestClassificationRollback(id: string, previewHash: string, adminId: number) {
  return db.transaction(async tx => {
    await lockMigrationTables(tx);
    const [run] = await tx.select().from(classificationMigrationRuns).where(eq(classificationMigrationRuns.id, id)).for("update");
    if (!run || run.status !== "applied" || run.previewHash !== previewHash) throw new Error("Этот перенос нельзя откатить.");
    const current = await inventory(tx);
    if (!run.afterSnapshot || classificationRollbackHash(current, run.afterSnapshot) !== run.afterHash) throw new Error("После переноса изменились данные. Автоматический откат запрещён.");
    await tx.update(classificationMigrationRuns).set({ rollbackApprovedByAdminId: adminId, rollbackApprovedAt: new Date() }).where(eq(classificationMigrationRuns.id, id));
    return enqueue(tx, run, "classification.rollback", adminId);
  });
}

async function apply(tx: DbTransaction, state: ClassificationSnapshot, manifest: ClassificationManifest) {
  const systemAuthorId = Number(state.systemAuthors[0].id);
  // Flatten published membership BEFORE deleting or reparenting anything.
  for (const decision of manifest.series.filter(row => row.group === "tag")) {
    const series = state.franchises.find(row => row.id === decision.id)!;
    const tag = decision.tagId === undefined
      ? (await tx.execute<{ id: number }>(sql`insert into tags(code,title) values (${String(series.code)},${parseTagTitle(String(series.title))}) returning id`))[0]
      : { id: decision.tagId };
    const mediaIds = publishedMembership(state, decision.id);
    if (mediaIds.length) await tx.execute(sql`insert into media_item_tags(media_item_id,tag_id,author_id)
      select x::integer,${tag.id},${systemAuthorId} from jsonb_array_elements_text(${JSON.stringify(mediaIds)}::jsonb) x
      on conflict do nothing`);
    await tx.execute(sql`update genres set replacement_tag_id=${tag.id},replacement_franchise_id=null where replacement_franchise_id=${decision.id}`);
    await tx.execute(sql`update achievements set params=(params-'seriesId') || jsonb_build_object('tagId',${tag.id}::int) where params->'seriesId'=${JSON.stringify(decision.id)}::jsonb`);
  }
  for (const decision of manifest.series.filter(row => row.group === "keep")) await tx.execute(sql`update franchises set parent_id=${decision.parentId} where id=${decision.id}`);
  const themes = manifest.series.filter(row => row.group === "tag").map(row => row.id);
  const ids = sql`select value::integer from jsonb_array_elements_text(${JSON.stringify(themes)}::jsonb)`;
  // Clear internal theme parent edges together; retained children already have explicit parents.
  await tx.execute(sql`update franchises set parent_id=null where id in (${ids})`);
  await tx.execute(sql`delete from media_item_franchise_removal_requests where franchise_id in (${ids})`);
  await tx.execute(sql`delete from media_item_franchises where franchise_id in (${ids})`);
  await tx.execute(sql`delete from franchises where id in (${ids})`);
}

/** Restore only journalled differences; never delete grants or unrelated user assignments. */
async function restore(tx: DbTransaction, before: ClassificationSnapshot, after: ClassificationSnapshot) {
  // Restore the series first (self-referencing FK is checked at statement end).
  const removedSeries = before.franchises.filter(row => !after.franchises.some(current => current.id === row.id));
  if (removedSeries.length) await tx.execute(sql`insert into franchises select * from jsonb_populate_recordset(null::franchises,${JSON.stringify(removedSeries)}::jsonb)`);
  for (const row of before.franchises) {
    const current = after.franchises.find(current => current.id === row.id);
    if (current && current.parent_id !== row.parent_id) await tx.execute(sql`update franchises set parent_id=${row.parent_id === null ? null : Number(row.parent_id)} where id=${Number(row.id)}`);
  }
  for (const row of before.genres) {
    const current = after.genres.find(current => current.id === row.id);
    if (current && (current.replacement_franchise_id !== row.replacement_franchise_id || current.replacement_tag_id !== row.replacement_tag_id)) await tx.execute(sql`update genres set replacement_franchise_id=${row.replacement_franchise_id == null ? null : Number(row.replacement_franchise_id)},replacement_tag_id=${row.replacement_tag_id == null ? null : Number(row.replacement_tag_id)} where id=${Number(row.id)}`);
  }
  for (const row of before.achievements) {
    const current = after.achievements.find(current => current.id === row.id);
    if (current && classificationHash(current.params) !== classificationHash(row.params)) await tx.execute(sql`update achievements set params=${JSON.stringify(row.params)}::jsonb where id=${Number(row.id)}`);
  }
  const restoreTables = [
    ["media_item_franchises", ["media_item_id", "franchise_id"]],
    ["media_item_franchise_removal_requests", ["media_item_id", "franchise_id"]],
    ["media_item_tags", ["media_item_id", "tag_id", "author_id"]],
  ] as const;
  for (const [table, keys] of restoreTables) {
    const key = (row: RawRow) => keys.map(field => row[field]).join(":");
    const previous = new Set(before[table].map(key));
    const next = new Set(after[table].map(key));
    const added = after[table].filter(row => !previous.has(key(row)));
    const removed = before[table].filter(row => !next.has(key(row)));
    for (const row of added) await tx.execute(sql`delete from ${sql.identifier(table)} where ${sql.join(keys.map(field => sql`${sql.identifier(field)}=${Number(row[field])}`), sql` and `)}`);
    if (removed.length) await tx.execute(sql`insert into ${sql.identifier(table)} select * from jsonb_populate_recordset(null::${sql.identifier(table)},${JSON.stringify(removed)}::jsonb)`);
  }
  for (const tag of after.tags.filter(row => !before.tags.some(previous => previous.id === row.id))) await tx.execute(sql`delete from tags where id=${Number(tag.id)}`);
}

export async function executeClassificationMigration(input: { migrationId: string; previewHash: string }, direction: "apply" | "rollback", guard: SnapshotJobGuard, signal: AbortSignal) {
  await db.transaction(async tx => {
    await guardSnapshotJob(tx, guard);
    await lockMigrationTables(tx);
    const [run] = await tx.select().from(classificationMigrationRuns).where(and(eq(classificationMigrationRuns.id, input.migrationId), eq(classificationMigrationRuns.previewHash, input.previewHash))).for("update");
    if (!run) throw new Error("Не найден утверждённый перенос.");
    if (direction === "apply" && run.status === "applied" || direction === "rollback" && run.status === "rolled_back") return;
    signal.throwIfAborted();
    const current = await inventory(tx);
    if (direction === "apply") {
      if (run.status !== "approved" || !run.approvedAt || !run.approvedByAdminId) throw new Error("Требуется подтверждение администратора.");
      if (classificationHash({ manifest: run.manifest, currentHash: current.hash }) !== run.previewHash) throw new Error("Предпросмотр устарел; перенос отменён.");
      const blockers = await migrationBlockers(tx, current.state, run.manifest);
      if (blockers.length) throw new Error(blockers.join(" "));
      await apply(tx, current.state, run.manifest);
      const next = await inventory(tx);
      if (classificationHash(current.proof) !== classificationHash(next.proof)) throw new Error("Изменились членство или прогресс ачивок; все изменения отменены.");
      await tx.update(classificationMigrationRuns).set({ status: "applied", appliedAt: new Date(), afterSnapshot: next.state, afterHash: next.hash }).where(eq(classificationMigrationRuns.id, run.id));
      const convertedSeriesIds = new Set(run.manifest.series.filter(row => row.group === "tag").map(row => row.id));
      const matchedTagIds = new Set(run.manifest.series.filter(row => row.group === "tag" && row.tagId !== undefined).map(row => row.tagId));
      const achievementIds = current.state.achievements.filter(row => {
        const params = row.params as RawRow;
        return convertedSeriesIds.has(Number(params.seriesId)) || matchedTagIds.has(Number(params.tagId));
      }).map(row => Number(row.id));
      if (achievementIds.length) await createJobRun({ type: "achievements.backfill", payload: { achievementIds, batchSize: 100 }, createdByAdminId: run.approvedByAdminId, source: "manual", maxAttempts: 3, retryBaseSeconds: 60, retryMaxSeconds: 300, timeoutSeconds: 300 }, new Date(), tx);
    } else {
      if (run.status !== "applied" || !run.afterSnapshot || !run.rollbackApprovedAt || !run.rollbackApprovedByAdminId || classificationRollbackHash(current, run.afterSnapshot) !== run.afterHash) throw new Error("Откат не подтверждён или данные после переноса изменились; откат запрещён.");
      await restore(tx, run.beforeSnapshot, run.afterSnapshot);
      const restored = await inventory(tx);
      const expected = classificationHash({ manifest: run.manifest, currentHash: classificationRollbackHash(restored, run.beforeSnapshot) });
      if (expected !== run.previewHash) throw new Error("Сверка восстановленного состояния не пройдена; откат отменён.");
      await tx.update(classificationMigrationRuns).set({ status: "rolled_back", rolledBackAt: new Date() }).where(eq(classificationMigrationRuns.id, run.id));
    }
    signal.throwIfAborted();
    await guardSnapshotJob(tx, guard);
  });
}


/** Bounded PK reads only for labels shown in the editor, never full media records. */
export async function getClassificationSelectionLabels(state: ClassificationSnapshot) {
  const mediaIds = [...new Set([
    ...state.media_item_franchises.filter(row => row.publication_status !== "published"),
    ...state.media_item_franchise_removal_requests,
  ].map(row => Number(row.media_item_id)))];
  const media = mediaIds.length
    ? await db.execute<{ id: number; title: string }>(sql`select id,title from media_items where id in (${sql.join(mediaIds.map(id => sql`${id}`), sql`,`)})`)
    : [];
  return Array.from(media);
}
