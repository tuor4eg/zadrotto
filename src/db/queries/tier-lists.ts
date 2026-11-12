import 'server-only';
import { queueTierPreview, queueTierPreviewCleanup } from '@/lib/tier-lists/preview-queue';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { authorMediaStatuses, authors, mediaItems, mediaTypes, tierLists, tierListTemplates, tierListSettings, tierListQuotaEvents } from '@/db/schema';
import { lockAuthorForTransaction, runInDomainEventTransaction, type DbTransaction } from '@/db/transaction';
import { normalizeSearchText } from '@/lib/search/normalize';
import { normalizeSearchSql, containsNormalizedSearchSql } from '@/db/search';
import { withSnapshotJobGuard, type SnapshotJobGuard } from '@/db/queries/provider-snapshots';
import { getAccessibleMediaTypeCodes } from '@/db/queries/media-types';
import { getMediaItemTilesByIds } from '@/db/queries/media-item-tiles';
import { DEFAULT_TIER_LIST_LIMITS, emptyTierDistribution, isUuid, parseTierConfiguration, parseTierDistribution, tierEntryIds, tierRangeError, type TierConfiguration, type TierCreateInput, type TierDistribution, type TierListDocument, type TierListLimits, type TierLocalDraft, type TierSaveInput } from '@/lib/tier-lists/model';


function signTierSnapshot(templateId:number, configuration:TierConfiguration) {
  const secret=process.env.ADMIN_SESSION_SECRET?.trim();
  if(!secret) throw new Error('ADMIN_SESSION_SECRET is not set');
  return createHmac('sha256',secret).update('tier-list-template-v1:'+templateId+':'+JSON.stringify(configuration)).digest('hex');
}
function verifyTierSnapshot(draft:TierLocalDraft) {
  const expected=Buffer.from(signTierSnapshot(draft.templateId,draft.configuration));
  const actual=Buffer.from(draft.snapshotToken);
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}

type Connection = typeof db | DbTransaction;
export class TierListError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
function fail(code: string, message: string): never { throw new TierListError(code, message); }
const visibleAuthor = sql`${authors.blockedAt} is null and ${authors.mergedIntoAuthorId} is null`;
const activeAuthor = sql`${visibleAuthor} and not ${authors.isSystem}`;
const publicList = and(eq(tierLists.status, 'published'), isNull(tierLists.hiddenAt), visibleAuthor)!;
export async function getTierListSettings(connection: Connection = db): Promise<TierListLimits> {
  const [row] = await connection.select().from(tierListSettings).where(eq(tierListSettings.id, 1));
  if (!row) return { ...DEFAULT_TIER_LIST_LIMITS };
  return { maxEntries: row.maxEntries, maxDrafts: row.maxDrafts, maxPublished: row.maxPublished, publicationsPerDay: row.publicationsPerDay, creationsPerDay: row.creationsPerDay, maxLevels: row.maxLevels };
}
export async function getTierTemplates() { const rows = await db.select({ id: tierListTemplates.id, name: tierListTemplates.name, configuration: tierListTemplates.configuration, isDefault: tierListTemplates.isDefault }).from(tierListTemplates).orderBy(desc(tierListTemplates.isDefault), asc(tierListTemplates.id)); return rows.map(row => ({...row,snapshotToken: signTierSnapshot(row.id,row.configuration)})); }
export async function getTierAvailableIds(ids: number[], authorId?: number, connection: Connection = db, admin = false) {
  if (!ids.length) return [];
  const codes = admin ? (await connection.select({code:mediaTypes.code}).from(mediaTypes).where(eq(mediaTypes.isPubliclyAvailable,true))).map(row=>row.code) : await getAccessibleMediaTypeCodes(authorId, connection);
  if (!codes.length) return [];
  return (await connection.select({ id: mediaItems.id }).from(mediaItems).innerJoin(mediaTypes, eq(mediaItems.mediaType, mediaTypes.code))
    .where(and(inArray(mediaItems.id, ids), eq(mediaItems.publicationStatus, 'published'), eq(mediaTypes.isPubliclyAvailable, true), inArray(mediaItems.mediaType, codes)))).map(row => row.id);
}
export async function getTierItems(ids: number[], ownerId?: number, viewerId?: number) {
  const available = await getTierAvailableIds(ids, viewerId);
  return getMediaItemTilesByIds(available, ownerId);
}
/** Viewer data for collection-style actions, fetched in batches for accessible entries only. */
export async function getTierViewerItems(ids: number[], viewerId?: number) {
  const available = await getTierAvailableIds(ids, viewerId);
  const [items, statuses] = await Promise.all([
    getMediaItemTilesByIds(available, viewerId),
    viewerId && available.length
      ? db.select({ mediaItemId: authorMediaStatuses.mediaItemId, status: authorMediaStatuses.status }).from(authorMediaStatuses)
          .where(and(eq(authorMediaStatuses.authorId, viewerId), inArray(authorMediaStatuses.mediaItemId, available)))
      : Promise.resolve([]),
  ]);
  const statusById = new Map(statuses.map(row => [row.mediaItemId, row.status]));
  return items.map(item => ({ item, currentAuthorStatus: statusById.get(item.id) ?? null }));
}
export async function tierDocument(row: typeof tierLists.$inferSelect, viewerId?: number, preserveUnavailable = viewerId === row.authorId, admin = false): Promise<TierListDocument> {
  const ids = tierEntryIds(row.distribution);
  const available = new Set(await getTierAvailableIds(ids, viewerId, db, admin));
  return { id: row.id, publicId: row.publicId, authorId: row.authorId, title: row.title, templateId: row.templateId,
    configuration: row.configuration, distribution: preserveUnavailable ? row.distribution : Object.fromEntries(Object.entries(row.distribution).map(([key, values]) => [key, values.filter(id => available.has(id))])),
    status: row.status, hiddenAt: row.hiddenAt?.toISOString() ?? null, version: row.version, clientCreationId: row.clientCreationId, unavailableCount: ids.length - available.size, unavailableIds: preserveUnavailable ? ids.filter(id => !available.has(id)) : [] };
}
export async function getTierList(publicId: string, viewerId?: number, ownOnly = false) {
  if (!isUuid(publicId)) return null;
  const conditions = ownOnly ? and(eq(tierLists.authorId, viewerId ?? -1), activeAuthor) : publicList;
  const [row] = await db.select({ list: tierLists, authorName: authors.name, authorAvatarObjectKey: authors.avatarObjectKey }).from(tierLists).innerJoin(authors, eq(authors.id, tierLists.authorId)).where(and(eq(tierLists.publicId, publicId), conditions)).limit(1);
  return row ? { document: await tierDocument(row.list, viewerId, ownOnly), authorName: row.authorName, authorAvatarObjectKey: row.authorAvatarObjectKey } : null;
}
function title(value: unknown) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) fail('validation', 'Укажите название длиной от 1 до 80 символов.'); return value.trim(); }
async function lockAuthor(tx: DbTransaction, authorId: number, allowBlocked = false, allowSystem = false) {
  // Acquire write table locks before author locks, matching the account-merge fence.
  await tx.execute(sql`select pg_advisory_xact_lock_shared(90420261)`);
  await tx.execute(sql`lock table authors, domain_event_outbox, domain_events, job_runs, tier_list_quota_events, tier_lists in row exclusive mode`);
  await lockAuthorForTransaction(tx, authorId);
  const [author] = await tx.select({ id: authors.id }).from(authors).where(and(eq(authors.id, authorId), allowBlocked ? isNull(authors.mergedIntoAuthorId) : allowSystem ? visibleAuthor : activeAuthor)).for('update');
  if (!author) fail('access', 'Аккаунт недоступен.');
}
async function lockOwnedList(tx: DbTransaction, publicId: string, authorId: number) {
  if (!isUuid(publicId)) fail('validation', 'Некорректный запрос.');
  const [row] = await tx.select().from(tierLists).where(and(eq(tierLists.publicId, publicId), eq(tierLists.authorId, authorId))).for('update');
  if (!row) fail('access', 'Тир-лист не найден.');
  return row;
}
async function lockList(tx: DbTransaction, publicId: string, authorId: number) {
  return lockOwnedList(tx, publicId, authorId);
}
async function usage(tx: DbTransaction, authorId: number) {
  const [counts] = await tx.select({ drafts: sql<number>`count(*) filter(where ${tierLists.status}='draft')::int`, published: sql<number>`count(*) filter(where ${tierLists.status}='published')::int` }).from(tierLists).where(eq(tierLists.authorId, authorId));
  const [recent] = await tx.select({ created: sql<number>`count(*) filter(where ${tierListQuotaEvents.kind}='created')::int`, published: sql<number>`count(*) filter(where ${tierListQuotaEvents.kind}='published')::int` }).from(tierListQuotaEvents).where(and(eq(tierListQuotaEvents.authorId, authorId), sql`${tierListQuotaEvents.occurredAt} > now() - interval '24 hours'`));
  return { drafts: counts.drafts, published: counts.published, createdToday: recent.created, publishedToday: recent.published };
}
async function validateEntries(tx: DbTransaction, distribution: TierDistribution, authorId: number, admin = false) {
  const ids = tierEntryIds(distribution);
  const valid = await getTierAvailableIds(ids, authorId, tx, admin);
  if (valid.length !== ids.length) fail('unavailable', 'Некоторые записи недоступны. Удалите их из списка и повторите сохранение.');
}
export async function createTierList(input: TierCreateInput, authorId: number, imported?: TierLocalDraft) {
  if (!isUuid(input.clientCreationId) || !Number.isSafeInteger(input.templateId) || input.templateId < 1) fail('validation', 'Некорректные данные создания.');
  const validTitle = title(input.title);
  if(imported && !verifyTierSnapshot(imported)) fail('validation','Снимок шаблона повреждён. Локальный черновик сохранён; выберите новый шаблон для переноса.');
  const row = await runInDomainEventTransaction(async (tx, append) => {
    await lockAuthor(tx, authorId);
    const [existing] = await tx.select().from(tierLists).where(and(eq(tierLists.authorId, authorId), eq(tierLists.clientCreationId, input.clientCreationId)));
    if (existing) return existing;
    const limits = await getTierListSettings(tx);
    const counts = await usage(tx, authorId);
    if (counts.drafts >= limits.maxDrafts || counts.createdToday >= limits.creationsPerDay) fail('quota', 'Достигнут лимит черновиков или создания тир-листов за 24 часа.');
    const [template] = await tx.select().from(tierListTemplates).where(eq(tierListTemplates.id, input.templateId)).for('share');
    // Local snapshots are untrusted but deliberately retained if their source template changed or was removed.
    const configuration = imported ? parseTierConfiguration(imported.configuration) : template?.configuration;
    if (!configuration) fail('validation', 'Шаблон недоступен. Выберите другой.');
    const distribution = parseTierDistribution(input.distribution ?? emptyTierDistribution(configuration), configuration, limits.maxEntries);
    if (!distribution) fail('validation', `Проверьте распределение записей. Максимум: ${limits.maxEntries}.`);
    await validateEntries(tx, distribution, authorId);
    const [created] = await tx.insert(tierLists).values({ authorId, title: validTitle, clientCreationId: input.clientCreationId, templateId: template?.id ?? null, configuration, distribution }).returning();
    await tx.insert(tierListQuotaEvents).values({ authorId, kind: 'created' });
    await append({ type: 'tier-list.created', actorAuthorId: authorId, aggregateType: 'tier-list', aggregateId: String(created.id), payload: { authorId, tierListId: created.id } });
    return created;
  });
  return tierDocument(row, authorId);
}
export async function saveTierList(input: TierSaveInput, authorId: number) {
  const validTitle = title(input.title);
  const row = await db.transaction(async tx => {
    await lockAuthor(tx, authorId);
    const existing = await lockList(tx, input.publicId, authorId);
    const limits = await getTierListSettings(tx);
    const distribution = parseTierDistribution(input.distribution, existing.configuration, Math.max(limits.maxEntries, tierEntryIds(existing.distribution).length));
    if (!distribution) fail('validation', 'Некорректное распределение записей или превышение лимита.');
    await validateEntries(tx, distribution, authorId);
    if (existing.status === 'published') { const error = tierRangeError(existing.configuration, distribution); if (error) fail('range', error); }
    const [updated] = await tx.update(tierLists).set({ title: validTitle, distribution, version: existing.version + 1, updatedAt: new Date() }).where(eq(tierLists.id, existing.id)).returning();
    await queueTierPreview(tx, updated);
    return updated;
  });
  return tierDocument(row, authorId);
}
export async function changeTierListStatus(input: { publicId: string; version: number; status: 'draft'|'published' }, authorId: number) {
  if (input.status !== 'draft' && input.status !== 'published') fail('validation', 'Некорректный статус.');
  const row = await db.transaction(async tx => {
    await lockAuthor(tx, authorId);
    const existing = await lockList(tx, input.publicId, authorId);
    if (existing.status === input.status) return existing;
    if (input.status === 'published') {
      if (existing.hiddenAt) fail('hidden', 'Администратор скрыл этот тир-лист.');
      const limits = await getTierListSettings(tx);
      const counts = await usage(tx, authorId);
      if (counts.published >= limits.maxPublished || counts.publishedToday >= limits.publicationsPerDay) fail('quota', 'Достигнут лимит опубликованных тир-листов или публикаций за 24 часа.');
      await validateEntries(tx, existing.distribution, authorId);
      const error = tierRangeError(existing.configuration, existing.distribution); if (error) fail('range', error);
      await tx.insert(tierListQuotaEvents).values({ authorId, kind: 'published' });
    }
    const [updated] = await tx.update(tierLists).set({ status: input.status, firstPublishedAt: input.status === 'published' ? existing.firstPublishedAt ?? new Date() : existing.firstPublishedAt, version: existing.version + 1, updatedAt: new Date() }).where(eq(tierLists.id, existing.id)).returning();
    await queueTierPreview(tx, updated);
    return updated;
  });
  return tierDocument(row, authorId);
}
export async function deleteTierList(input: {publicId:string;version:number}, authorId: number) {
  await db.transaction(async tx => { await lockAuthor(tx, authorId); const row = await lockList(tx, input.publicId, authorId); await queueTierPreviewCleanup(tx, row.previewObjectKey); await tx.delete(tierLists).where(eq(tierLists.id, row.id)); });
}
export async function saveTierListSettings(input: TierListLimits, adminId: number) {
  const limits = { maxEntries: 1000, maxLevels: 20, maxDrafts: 1000, maxPublished: 1000, publicationsPerDay: 1000, creationsPerDay: 1000 };
  for (const key of Object.keys(limits) as (keyof TierListLimits)[]) if (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > limits[key]) fail('validation', `Некорректное ограничение: ${key}.`);
  await db.insert(tierListSettings).values({ id: 1, ...input, updatedByAdminId: adminId }).onConflictDoUpdate({ target: tierListSettings.id, set: { ...input, updatedByAdminId: adminId, updatedAt: new Date() } });
}
export async function saveTierTemplate(input: {id?:number;name:string;configuration:TierConfiguration;isDefault:boolean}, adminId:number) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(42002,1)`);
    const limits = await getTierListSettings(tx);
    const configuration = parseTierConfiguration(input.configuration, limits.maxLevels);
    if (!configuration || !input.name.trim() || input.name.trim().length > 80) fail('validation', 'Проверьте название и конфигурацию уровней.');
    const [current] = input.id ? await tx.select().from(tierListTemplates).where(eq(tierListTemplates.id, input.id)).for('update') : [];
    if (input.id && !current) fail('validation', 'Шаблон не найден.');
    if (current?.isDefault && !input.isDefault) fail('validation', 'Сначала назначьте другой шаблон по умолчанию.');
    if (input.isDefault) await tx.update(tierListTemplates).set({ isDefault: false }).where(eq(tierListTemplates.isDefault, true));
    const values = { name: input.name.trim(), configuration, isDefault: input.isDefault, updatedByAdminId: adminId, updatedAt: new Date() };
    return input.id ? (await tx.update(tierListTemplates).set(values).where(eq(tierListTemplates.id, input.id)).returning())[0] : (await tx.insert(tierListTemplates).values({ ...values, createdByAdminId: adminId }).returning())[0];
  });
}
export async function deleteTierTemplate(id:number, adminId:number) {
  if (!Number.isSafeInteger(adminId) || adminId < 1) fail('access','Требуется администратор.');
  await db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(42002,1)`); const [row] = await tx.select().from(tierListTemplates).where(eq(tierListTemplates.id,id)).for('update'); if (!row) fail('validation','Шаблон не найден.'); if(row.isDefault) fail('validation','Сначала назначьте другой шаблон по умолчанию.'); await tx.delete(tierListTemplates).where(eq(tierListTemplates.id,id)); });
}
export async function moderateTierList(input:{publicId:string;action:'hide'|'restore'|'delete'}, adminId:number) {
  if (!Number.isSafeInteger(adminId) || adminId < 1) fail('access','Требуется администратор.');
  if (!isUuid(input.publicId)) fail('validation','Тир-лист не найден.');
  await db.transaction(async tx => {
    // Resolve owner first; merge fences this table before moving ownership.
    const [owner] = await tx.select({id:tierLists.authorId}).from(tierLists).where(eq(tierLists.publicId,input.publicId));
    if (!owner) fail('validation','Тир-лист не найден.');
    await lockAuthor(tx, owner.id, true);
    const [row] = await tx.select().from(tierLists).where(eq(tierLists.publicId,input.publicId)).for('update');
    if (!row || row.authorId !== owner.id) fail('conflict','Владелец изменился. Повторите действие.');
    if(input.action==='delete') { await queueTierPreviewCleanup(tx, row.previewObjectKey); await tx.delete(tierLists).where(eq(tierLists.id,row.id)); return; }
    if(input.action!=='hide' && input.action!=='restore') fail('validation','Некорректное действие.');
    const [updated] = await tx.update(tierLists).set({ hiddenAt:input.action==='hide'?new Date():null, hiddenReason:null, version:row.version+1, updatedAt:new Date() }).where(eq(tierLists.id,row.id)).returning();
    await queueTierPreview(tx, updated);
  });
}
export type TierCatalogueInput = { q?:string;authorId?:number;mine?:boolean;viewerId?:number;sort?:string;page?:number;pageSize?:number;status?:string };
async function catalogue(input: TierCatalogueInput, admin=false) {
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, 10000):1;
  const pageSize = input.pageSize===48||input.pageSize===72 ? input.pageSize : 24;
  const conditions: SQL[] = [];
  if(!admin) conditions.push(input.mine ? and(eq(tierLists.authorId,input.viewerId??-1),activeAuthor)! : publicList);
  if(input.authorId) conditions.push(eq(tierLists.authorId,input.authorId));
  if(input.q?.trim()) conditions.push(containsNormalizedSearchSql(tierLists.title,input.q.trim().slice(0,200)));
  if(admin && input.status) { if(input.status==='hidden') conditions.push(sql`${tierLists.hiddenAt} is not null`); else if(input.status==='draft'||input.status==='published') conditions.push(eq(tierLists.status,input.status)); }
  if(!admin && input.mine && input.status==='hidden') conditions.push(sql`${tierLists.hiddenAt} is not null`);
  if(!admin && input.mine && (input.status==='draft'||input.status==='published')) conditions.push(eq(tierLists.status,input.status), isNull(tierLists.hiddenAt));
  const where = and(...conditions);
  const [count] = await db.select({n:sql<number>`count(*)::int`}).from(tierLists).innerJoin(authors,eq(authors.id,tierLists.authorId)).where(where);
  const totalPages = Math.max(1,Math.ceil(count.n/pageSize));
  const actualPage=Math.min(page,totalPages);
  const chronological = input.mine ? tierLists.updatedAt : tierLists.firstPublishedAt;
  const order = input.sort==='title' ? asc(tierLists.title) : input.sort==='oldest' ? asc(chronological) : desc(chronological);
  const items=await db.select({id:tierLists.id,publicId:tierLists.publicId,title:tierLists.title,authorId:tierLists.authorId,authorName:authors.name,authorAvatarObjectKey:authors.avatarObjectKey,status:tierLists.status,hiddenAt:tierLists.hiddenAt,hiddenReason:tierLists.hiddenReason,version:tierLists.version,createdAt:tierLists.createdAt,updatedAt:tierLists.updatedAt,firstPublishedAt:tierLists.firstPublishedAt}).from(tierLists).innerJoin(authors,eq(authors.id,tierLists.authorId)).where(where).orderBy(order,desc(tierLists.id)).limit(pageSize).offset((actualPage-1)*pageSize);
  return {items,page:actualPage,pageSize,totalCount:count.n,totalPages};
}
export async function getTierListCatalogue(input:TierCatalogueInput) { return catalogue(input); }
export async function getTierListAdminPage(input:TierCatalogueInput) { return catalogue(input,true); }
export async function listPublishedTierListAuthors() {
  return db.selectDistinct({ id: authors.id, name: authors.name }).from(tierLists).innerJoin(authors, eq(authors.id, tierLists.authorId)).where(publicList).orderBy(asc(authors.name), asc(authors.id));
}
export async function getMyTierListStatusCounts(authorId: number) {
  const [counts] = await db.select({
    all: sql<number>`count(*)::int`,
    published: sql<number>`count(*) filter (where ${tierLists.status}='published' and ${tierLists.hiddenAt} is null)::int`,
    draft: sql<number>`count(*) filter (where ${tierLists.status}='draft' and ${tierLists.hiddenAt} is null)::int`,
    hidden: sql<number>`count(*) filter (where ${tierLists.hiddenAt} is not null)::int`,
  }).from(tierLists).innerJoin(authors, eq(authors.id, tierLists.authorId)).where(and(eq(tierLists.authorId, authorId), activeAuthor));
  return counts ?? { all: 0, published: 0, draft: 0, hidden: 0 };
}
export async function searchTierListAuthors(q:string, viewerId?:number) {
  if(!q.trim())return [];
  return db.select({id:authors.id,name:authors.name}).from(authors).where(and(visibleAuthor,containsNormalizedSearchSql(authors.name,q.slice(0,100)),sql`(${authors.isSystem} or ${authors.isDiscoverable} or ${authors.id}=${viewerId??-1})`,sql`exists(select 1 from tier_lists t where t.author_id=${authors.id} and t.status='published' and t.hidden_at is null)`)).orderBy(asc(authors.name),asc(authors.id)).limit(20);
}

export async function cleanupTierListQuotaHistory(guard?:SnapshotJobGuard) {
  await withSnapshotJobGuard(guard,async tx=>{await tx.delete(tierListQuotaEvents).where(sql`${tierListQuotaEvents.occurredAt} < now() - interval '48 hours'`);});
}

export async function getTierListAdminAuthor(authorId: number, includeBlocked = false) {
  const [author] = await db.select({id:authors.id,name:authors.name,isSystem:authors.isSystem})
    .from(authors).where(and(eq(authors.id,authorId),includeBlocked ? isNull(authors.mergedIntoAuthorId) : visibleAuthor)).limit(1);
  return author ?? null;
}
export async function getDefaultTierListAdminAuthor() {
  const [author] = await db.select({id:authors.id,name:authors.name,isSystem:authors.isSystem})
    .from(authors).where(and(eq(authors.isSystem,true),visibleAuthor))
    .orderBy(sql`case when ${normalizeSearchSql(authors.name)}=${normalizeSearchText('Редакция')} then 0 else 1 end`,asc(authors.id)).limit(1);
  return author ?? null;
}
export async function searchTierListAdminAuthors(query:string) {
  const q=normalizeSearchText(query).slice(0,100);
  if(q.length<2)return [];
  return db.select({id:authors.id,name:authors.name,isSystem:authors.isSystem}).from(authors)
    .where(and(visibleAuthor,containsNormalizedSearchSql(authors.name,q)))
    .orderBy(desc(authors.isSystem),asc(authors.name),asc(authors.id)).limit(20);
}
export async function getAdminTierList(publicId:string) {
  if(!isUuid(publicId))return null;
  const [row]=await db.select().from(tierLists).where(eq(tierLists.publicId,publicId)).limit(1);
  return row ? tierDocument(row,row.authorId,true,true) : null;
}
export async function getAdminTierItems(ids:number[],authorId:number) {
  const available=await getTierAvailableIds(ids,undefined,db,true);
  return getMediaItemTilesByIds(available,authorId);
}
export type AdminTierListInput = {
  publicId?:string;version?:number;clientCreationId:string;authorId:number;
  templateId:number;title:string;distribution:TierDistribution;status:'draft'|'published';
};

/** Admin author assignment and publication commit together; hidden state is never overwritten. */
export async function saveAdminTierList(input:AdminTierListInput,adminId:number) {
  if(!Number.isSafeInteger(adminId)||adminId<1||!Number.isSafeInteger(input.authorId)||input.authorId<1||!isUuid(input.clientCreationId)) fail('validation','Проверьте автора и данные тир-листа.');
  if(input.status!=='draft'&&input.status!=='published')fail('validation','Некорректный статус.');
  if(input.publicId&&!isUuid(input.publicId))fail('validation','Некорректная ссылка тир-листа.');
  const validTitle=title(input.title);
  const row=await runInDomainEventTransaction(async(tx,append)=>{
    // Discover ownership, then acquire both author locks in a deterministic order.
    const [source]=input.publicId ? await tx.select().from(tierLists).where(eq(tierLists.publicId,input.publicId)).limit(1):[];
    if(input.publicId&&!source)fail('access','Тир-лист не найден.');
    for(const id of [...new Set([source?.authorId,input.authorId].filter((id):id is number=>id!==undefined))].sort((a,b)=>a-b)) {
      await lockAuthor(tx,id,id!==input.authorId||source?.authorId===id,true);
    }
    let existing=source ? await lockList(tx,source.publicId,source.authorId):undefined;
    if(!source) {
      [existing]=await tx.select().from(tierLists).where(or(eq(tierLists.publicId,input.clientCreationId),and(eq(tierLists.authorId,input.authorId),eq(tierLists.clientCreationId,input.clientCreationId))));
      // A retried create must not overwrite a later edit.
      if(existing)return existing;
    }
    const limits=await getTierListSettings(tx);
    const counts=await usage(tx,input.authorId);
    const moving=!!existing&&existing.authorId!==input.authorId;
    const creating=!existing;
    const enteringPublished=input.status==='published'&&(creating||existing?.status!=='published');
    if(enteringPublished&&existing?.hiddenAt)fail('hidden','Сначала восстановите скрытый тир-лист в модерации.');
    if(creating&&counts.createdToday>=limits.creationsPerDay)fail('quota','Достигнут лимит создания тир-листов за 24 часа.');
    if(input.status==='draft'&&(creating||moving)&&counts.drafts>=limits.maxDrafts)fail('quota','Достигнут лимит черновиков выбранного автора.');
    if(input.status==='published'&&(enteringPublished||moving)&&counts.published>=limits.maxPublished)fail('quota','Достигнут лимит опубликованных тир-листов выбранного автора.');
    if(enteringPublished&&counts.publishedToday>=limits.publicationsPerDay)fail('quota','Достигнут лимит публикаций за 24 часа.');
    const [template]=creating&&Number.isSafeInteger(input.templateId) ? await tx.select().from(tierListTemplates).where(eq(tierListTemplates.id,input.templateId)).for('share'):[];
    const configuration=existing?.configuration??template?.configuration;
    if(!configuration)fail('validation','Выберите доступный шаблон.');
    const distribution=parseTierDistribution(input.distribution,configuration,Math.max(limits.maxEntries,existing?tierEntryIds(existing.distribution).length:0));
    if(!distribution)fail('validation','Проверьте распределение и лимит записей.');
    await validateEntries(tx,distribution,input.authorId,true);
    if(input.status==='published'){const error=tierRangeError(configuration,distribution);if(error)fail('range',error);}
    if(moving&&existing){
      const [collision]=await tx.select({id:tierLists.id}).from(tierLists).where(and(eq(tierLists.authorId,input.authorId),eq(tierLists.clientCreationId,existing.clientCreationId)));
      if(collision)await tx.update(tierLists).set({clientCreationId:sql`gen_random_uuid()`}).where(eq(tierLists.id,existing.id));
    }
    const values={title:validTitle,authorId:input.authorId,distribution,status:input.status,firstPublishedAt:input.status==='published'?(existing?.firstPublishedAt??new Date()):(existing?.firstPublishedAt??null),updatedAt:new Date()};
    const [saved]=existing ? await tx.update(tierLists).set({...values,version:existing.version+1}).where(eq(tierLists.id,existing.id)).returning()
      : await tx.insert(tierLists).values({...values,publicId:input.clientCreationId,configuration,templateId:template?.id??null,clientCreationId:input.clientCreationId}).returning();
    await queueTierPreview(tx, saved);
    if(creating){
      await tx.insert(tierListQuotaEvents).values({authorId:input.authorId,kind:'created'});
      await append({type:'tier-list.created',actorAuthorId:null,aggregateType:'tier-list',aggregateId:String(saved.id),payload:{authorId:input.authorId,tierListId:saved.id}});
    }
    if(enteringPublished)await tx.insert(tierListQuotaEvents).values({authorId:input.authorId,kind:'published'});
    return saved;
  });
  return tierDocument(row,row.authorId,true,true);
}

export async function getTierTemplateById(id: number) {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return null;
  const [template] = await db.select({ id:tierListTemplates.id, name:tierListTemplates.name, configuration:tierListTemplates.configuration, isDefault:tierListTemplates.isDefault })
    .from(tierListTemplates).where(eq(tierListTemplates.id,id)).limit(1);
  return template ?? null;
}
