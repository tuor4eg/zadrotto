import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountMergeArchive, accountMergeGrants, authorAccounts, authorAuthIdentities, authorSessions, authors, authProviderSettings } from "@/db/schema";
import { runInDomainEventTransaction, type DbTransaction } from "@/db/transaction";
import { AUTHOR_SESSION_MAX_AGE_SECONDS, generateAuthorSessionToken, hashAuthorSessionToken } from "@/lib/auth/author-session";
import { EXTERNAL_AUTH_PROVIDER_DEFINITIONS } from "@/lib/auth/external/provider-definitions";
import type { AccountMergePreview } from "@/lib/auth/account-merge-model";
import { reconcileMergedReputation } from "@/lib/reputation/account-merge";

export class AccountMergeError extends Error {
  constructor(public readonly code: "expired" | "session-changed" | "unavailable" | "stale") { super(code); this.name = "AccountMergeError"; }
}

type Row = Record<string, unknown>;
type Policy = { table: string; owner: string; keys?: string[]; label: string; special?: boolean };
// Server-owned identifiers only. New author references must be covered by the schema coverage test.
export const ACCOUNT_MERGE_POLICIES: readonly Policy[] = [
  { table: "tier_lists", owner: "author_id", label: "Тир-листы" },
  { table: "tier_list_quota_events", owner: "author_id", label: "История квот тир-листов" },
  { table: "ratings", owner: "author_id", keys: ["media_item_id", "part_id"], label: "Оценки" },
  { table: "author_media_statuses", owner: "author_id", keys: ["media_item_id"], label: "Желаемое" },
  { table: "author_media_experiences", owner: "author_id", keys: ["media_item_id"], label: "Опыт знакомства" },
  { table: "contributions", owner: "author_id", label: "Рецензии и предложения", special: true },
  { table: "author_friendships", owner: "first_author_id", label: "Друзья и заявки", special: true },
  { table: "author_media_type_settings", owner: "author_id", keys: ["media_type_id"], label: "Настройки типов записей" },
  { table: "author_archive_exploration_settings", owner: "author_id", keys: [], label: "Настройки знакомства с архивом" },
  { table: "quiz_participants", owner: "author_id", keys: ["quiz_id"], label: "Участие в викторинах" },
  { table: "user_achievements", owner: "author_id", keys: ["achievement_level_id"], label: "Достижения" },
  { table: "review_reactions", owner: "user_id", keys: ["review_id", "type"], label: "Реакции" },
  { table: "media_items", owner: "created_by_author_id", label: "Добавленные записи", special: true },
  { table: "franchises", owner: "created_by_author_id", label: "Добавленные серии" },
  { table: "media_item_franchises", owner: "created_by_author_id", label: "Связи с сериями" },
  { table: "media_item_franchise_removal_requests", owner: "requested_by_author_id", keys: ["media_item_id", "franchise_id"], label: "Предложения удаления связей" },
  { table: "bug_reports", owner: "author_id", label: "Сообщения об ошибках" },
  { table: "notifications", owner: "recipient_id", label: "Уведомления", special: true },
  { table: "author_accounts", owner: "author_id", keys: [], label: "Парольный вход", special: true },
  { table: "author_emails", owner: "author_id", label: "Подтверждённые email", special: true },
  { table: "author_auth_identities", owner: "author_id", keys: ["provider"], label: "Внешние способы входа", special: true },
  { table: "personal_data_consents", owner: "author_id", label: "История согласий", special: true },
  { table: "author_action_ledger", owner: "author_id", label: "История опыта и доверия", special: true },
  { table: "author_progress", owner: "author_id", label: "Уровень", special: true },
  { table: "author_trust", owner: "author_id", label: "Доверие", special: true },
  { table: "author_sessions", owner: "author_id", label: "Сессии", special: true },
  { table: "author_access_tokens", owner: "author_id", label: "Токены доступа", special: true },
  { table: "author_auth_challenges", owner: "author_id", label: "Подтверждения входа", special: true },
];
const MUTABLE_TABLES = [...new Set(["authors", ...ACCOUNT_MERGE_POLICIES.map(p => p.table), "contribution_reviews", "contribution_media_items", "media_item_rating_stats", "account_merge_grants", "account_merge_archive", "level_settings"])].sort();
const id = (name: string) => sql.identifier(name);
const key = (row: Row, fields: string[]) => JSON.stringify(fields.map(field => row[field] ?? null));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function lockMerge(tx: DbTransaction) {
  await tx.execute(sql`set local lock_timeout = '5s'`);
  await tx.execute(sql`select pg_advisory_xact_lock_shared(90420261)`);
  // Rare MVP operation: fence all writers before taking row locks, including background jobs.
  await tx.execute(sql`lock table ${sql.join(MUTABLE_TABLES.map(id), sql`, `)} in share row exclusive mode`);
}
async function lockAuthors(tx: DbTransaction, authorIds: number[]) {
  for (const authorId of [...new Set(authorIds)].sort((a, b) => a - b)) {
    await tx.execute(sql`select pg_advisory_xact_lock(42001, ${authorId})`);
    const [author] = await tx.select().from(authors).where(eq(authors.id, authorId)).for("update");
    if (!author || author.mergedIntoAuthorId || author.blockedAt || author.isSystem) throw new AccountMergeError("unavailable");
    const [account] = await tx.select().from(authorAccounts).where(eq(authorAccounts.authorId, authorId));
    if (account && !["active", "pending_email"].includes(account.status)) throw new AccountMergeError("unavailable");
  }
}
async function activeSession(tx: DbTransaction, authorId: number, sessionId: number) {
  const [session] = await tx.select().from(authorSessions).where(and(eq(authorSessions.id, sessionId), eq(authorSessions.authorId, authorId), isNull(authorSessions.revokedAt), gt(authorSessions.expiresAt, new Date())));
  if (!session) throw new AccountMergeError("session-changed");
  return session;
}
async function configuration(tx: DbTransaction, provider: string, revision: string) {
  const [settings] = await tx.select().from(authProviderSettings).where(eq(authProviderSettings.providerCode, provider)).for("share");
  if (!settings?.enabled || settings.revision !== revision) throw new AccountMergeError("unavailable");
}
export async function createAccountMergeGrant(input: { authorId: number; sessionId: number; provider: string; subject: string; configurationRevision: string }) {
  return db.transaction(async tx => {
    // Same fence/order as confirmation: linking cannot race a merge of either author.
    await lockMerge(tx);
    const [identity] = await tx.select().from(authorAuthIdentities).where(and(eq(authorAuthIdentities.provider, input.provider), eq(authorAuthIdentities.providerSubject, input.subject)));
    if (!identity || identity.authorId === input.authorId) throw new AccountMergeError("unavailable");
    await lockAuthors(tx, [input.authorId, identity.authorId]);
    await activeSession(tx, input.authorId, input.sessionId);
    await configuration(tx, input.provider, input.configurationRevision);
    const [grant] = await tx.insert(accountMergeGrants).values({ initiatorAuthorId: input.authorId, initiatorSessionId: input.sessionId, secondaryAuthorId: identity.authorId, identityId: identity.id, provider: input.provider, configurationRevision: input.configurationRevision, expiresAt: new Date(Date.now() + 600_000) }).returning({ grantId: accountMergeGrants.id });
    return grant;
  });
}

type MergeInput = { grantId: string; authorId: number; sessionId: number; primaryAuthorId?: number };
async function checkedGrant(tx: DbTransaction, input: MergeInput) {
  if (!uuid.test(input.grantId)) throw new AccountMergeError("expired");
  const [grant] = await tx.select().from(accountMergeGrants).where(eq(accountMergeGrants.id, input.grantId));
  if (!grant || grant.consumedAt || grant.expiresAt.getTime() <= Date.now()) throw new AccountMergeError("expired");
  if (grant.initiatorAuthorId !== input.authorId || grant.initiatorSessionId !== input.sessionId) throw new AccountMergeError("session-changed");
  const primary = input.primaryAuthorId ?? grant.initiatorAuthorId;
  if (![grant.initiatorAuthorId, grant.secondaryAuthorId].includes(primary)) throw new AccountMergeError("unavailable");
  await activeSession(tx, input.authorId, input.sessionId);
  await configuration(tx, grant.provider, grant.configurationRevision);
  const [identity] = await tx.select().from(authorAuthIdentities).where(eq(authorAuthIdentities.id, grant.identityId));
  if (!identity || identity.authorId !== grant.secondaryAuthorId || identity.provider !== grant.provider) throw new AccountMergeError("unavailable");
  await lockAuthors(tx, [grant.initiatorAuthorId, grant.secondaryAuthorId]);
  return { grant, primary, secondary: primary === grant.initiatorAuthorId ? grant.secondaryAuthorId : grant.initiatorAuthorId };
}
async function rows(tx: DbTransaction, table: string, condition: ReturnType<typeof sql>) {
  const result = await tx.execute(sql`select to_jsonb(t) as data from ${id(table)} t where ${condition}`);
  return Array.from(result, r => r.data as Row).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
async function snapshot(tx: DbTransaction, pair: number[]) {
  const data: Record<string, Row[]> = {};
  for (const p of ACCOUNT_MERGE_POLICIES) {
    const condition = p.table === "author_friendships"
      ? sql`first_author_id in (${sql.join(pair.map(n => sql`${n}`), sql`, `)}) or second_author_id in (${sql.join(pair.map(n => sql`${n}`), sql`, `)})`
      : sql`${id(p.owner)} in (${sql.join(pair.map(n => sql`${n}`), sql`, `)}) ${p.table === "notifications" ? sql`and recipient_type = 'author'` : sql``}`;
    data[p.table] = await rows(tx, p.table, condition);
  }
  data.authors = await rows(tx, "authors", sql`id in (${sql.join(pair.map(n => sql`${n}`), sql`, `)})`);
  for (const table of ["contribution_reviews", "contribution_media_items"]) {
    data[table] = await rows(tx, table, sql`contribution_id in (select id from contributions where author_id in (${sql.join(pair.map(n => sql`${n}`), sql`, `)}))`);
  }
  // Include other people's reactions to affected reviews in the reviewed version/archive.
  data.reviewDependents = await rows(tx, "review_reactions", sql`review_id in (select id from contributions where author_id in (${sql.join(pair.map(n => sql`${n}`), sql`, `)}))`);
  for (const session of data.author_sessions) delete session.last_seen_at;
  return data;
}
function conflicts(p: Policy, row: Row, own: Row[], data: Record<string, Row[]>, primary: number) {
  if (p.table === "ratings" && data.author_media_statuses.some(r => r.author_id === primary && r.media_item_id === row.media_item_id)) return true;
  if (p.table === "author_media_statuses" && data.ratings.some(r => r.author_id === primary && r.media_item_id === row.media_item_id)) return true;
  if (p.table === "review_reactions" && data.contributions.some(r => r.id === row.review_id)) return true;
  if (p.table === "contributions") return row.type === "review" && own.some(r => r.type === "review" && key(r, ["primary_media_item_id", "part_id"]) === key(row, ["primary_media_item_id", "part_id"]));

  return p.keys !== undefined && own.some(r => key(r, p.keys!) === key(row, p.keys!));
}
function preview(input: MergeInput, primary: number, secondary: number, data: Record<string, Row[]>): AccountMergePreview {
  const counts = ACCOUNT_MERGE_POLICIES.filter(p => !["author_sessions", "author_auth_challenges", "author_access_tokens", "author_progress", "author_trust", "author_action_ledger"].includes(p.table)).map(p => {
    if (p.table === "author_friendships") {
      const own = data[p.table].filter(r => r.first_author_id === primary || r.second_author_id === primary);
      const incoming = data[p.table].filter(r => r.first_author_id === secondary || r.second_author_id === secondary);
      const other = (r: Row, author: number) => r.first_author_id === author ? r.second_author_id : r.first_author_id;
      const count = incoming.filter(r => other(r, secondary) === primary || own.some(o => other(o, primary) === other(r, secondary))).length;
      return { label: p.label, transferred: incoming.length - count, conflicts: count };
    }
    const own = data[p.table].filter(r => r[p.owner] === primary);
    const incoming = data[p.table].filter(r => r[p.owner] === secondary);
    const count = incoming.filter(r => conflicts(p, r, own, data, primary) || (p.table === "author_emails" && !r.verified_at)
      || (p.table === "personal_data_consents" && r.revoked_at === null && own.some(o => o.version === r.version && o.revoked_at === null))).length;
    return { label: p.label, transferred: incoming.length - count, conflicts: count };
  });
  const ownIdentity = data.author_auth_identities.filter(r => r.author_id === primary);
  const ownSelfReactions = data.review_reactions.filter(r => r.user_id === primary && data.contributions.some(c => c.id === r.review_id && c.author_id === secondary));
  if (ownSelfReactions.length) counts.push({ label: "Реакции, ставшие собственными", transferred: 0, conflicts: ownSelfReactions.length });
  const disabledMethods = data.author_auth_identities.filter(r => r.author_id === secondary && ownIdentity.some(o => o.provider === r.provider)).map(r => `${EXTERNAL_AUTH_PROVIDER_DEFINITIONS.find(p => p.code === r.provider)?.name ?? r.provider}${r.display_value ? ` (${r.display_value})` : ""}`);
  if (data.author_accounts.some(r => r.author_id === primary) && data.author_accounts.some(r => r.author_id === secondary)) disabledMethods.push("Логин и пароль второго аккаунта");
  const version = createHash("sha256").update(JSON.stringify({ primary, secondary, data })).digest("hex");
  return { grantId: input.grantId, primaryAuthorId: primary, version, disabledMethods, counts, accounts: data.authors.map(a => ({ id: Number(a.id), name: String(a.name), avatarObjectKey: a.avatar_object_key as string | null, login: data.author_accounts.find(r => r.author_id === a.id)?.login as string ?? null, ratings: data.ratings.filter(r => r.author_id === a.id).length, reviews: data.contributions.filter(r => r.author_id === a.id && r.type === "review").length })) };
}
export async function getAccountMergePreview(input: MergeInput) {
  return db.transaction(async tx => {
    // A short fence gives a consistent snapshot across tables, including preview.
    await lockMerge(tx);
    const { primary, secondary } = await checkedGrant(tx, input);
    return preview(input, primary, secondary, await snapshot(tx, [primary, secondary]));
  });
}

async function archive(tx: DbTransaction, mergeId: string, source: number, table: string, row: Row, reason = "primary-wins") {
  // Never persist authentication material in the private content archive.
  if (["author_accounts", "author_sessions", "author_access_tokens", "author_auth_challenges", "author_auth_identities", "author_emails"].includes(table)) return;
  await tx.insert(accountMergeArchive).values({ mergeId, sourceAuthorId: source, tableName: table, entityKey: String(row.id ?? row.contribution_id ?? key(row, Object.keys(row).filter(k => !k.endsWith("_at")))), reason, snapshot: row });
}
async function deleteRow(tx: DbTransaction, p: Policy, row: Row) {
  const fields = row.id !== undefined ? ["id"] : [p.owner, ...(p.keys ?? [])];
  await tx.execute(sql`delete from ${id(p.table)} where ${sql.join(fields.map(f => sql`${id(f)} is not distinct from ${row[f]}`), sql` and `)}`);
}
async function transfer(tx: DbTransaction, p: Policy, row: Row, primary: number) {
  const fields = row.id !== undefined ? ["id"] : [p.owner, ...(p.keys ?? [])];
  await tx.execute(sql`update ${id(p.table)} set ${id(p.owner)} = ${primary} where ${sql.join(fields.map(f => sql`${id(f)} is not distinct from ${row[f]}`), sql` and `)}`);
}
async function applyMerge(tx: DbTransaction, mergeId: string, primary: number, secondary: number, data: Record<string, Row[]>, onStep: (stage: string) => void) {
  const ratingAliases: Record<string, string> = {};
  const reviewAliases: Record<string, string> = {};
  const pair = sql`${primary}, ${secondary}`;
  onStep("revoke-access");
  await tx.execute(sql`update author_sessions set revoked_at = now() where author_id in (${pair}) and revoked_at is null`);
  await tx.execute(sql`update author_access_tokens set revoked_at = now() where author_id in (${pair}) and revoked_at is null`);
  await tx.execute(sql`update author_auth_challenges set consumed_at = now() where author_id in (${pair}) and consumed_at is null`);
  // Archive the losing profile's public metadata, not its credentials.
  onStep("archive-profile");
  await archive(tx, mergeId, secondary, "authors", data.authors.find(r => r.id === secondary)!, "merged-profile");
  for (const p of ACCOUNT_MERGE_POLICIES) {
    if (["author_friendships", "author_action_ledger", "author_progress", "author_trust", "author_sessions", "author_access_tokens", "author_auth_challenges", "personal_data_consents"].includes(p.table)) continue;
    onStep(`transfer-${p.table.replaceAll("_", "-")}`);
    const own = data[p.table].filter(r => r[p.owner] === primary);
    for (const row of data[p.table].filter(r => r[p.owner] === secondary)) {
      const losing = conflicts(p, row, own, data, primary);
      if (p.table === "author_emails") {
        if (!row.verified_at) { await deleteRow(tx, p, row); continue; }
        // Keep the winner's primary email. Only promote the secondary's verified primary.
        const primaryExists = own.some(r => r.is_primary === true);
        if (row.is_primary && primaryExists) await tx.execute(sql`update author_emails set is_primary = false where id = ${row.id}`);
      }
      if (losing) {
        await archive(tx, mergeId, secondary, p.table, row, p.table === "review_reactions" && data.contributions.some(r => r.id === row.review_id) ? "merged-self-reaction" : "primary-wins");
        if (p.table === "ratings") {
          const target = own.find(r => key(r, p.keys!) === key(row, p.keys!));
          if (target) ratingAliases[String(row.id)] = String(target.id);
        }
        if (p.table === "contributions") {
          const target = own.find(r => r.type === "review" && key(r, ["primary_media_item_id", "part_id"]) === key(row, ["primary_media_item_id", "part_id"]));
          if (target) reviewAliases[String(row.id)] = String(target.id);
          for (const child of ["contribution_reviews", "contribution_media_items", "reviewDependents"]) {
            for (const dependent of data[child].filter(r => (r.contribution_id ?? r.review_id) === row.id)) {
              await archive(tx, mergeId, secondary, child === "reviewDependents" ? "review_reactions" : child, dependent, "discarded-review");
            }
          }
        }
        await deleteRow(tx, p, row);
      } else {
        if (p.table === "media_items" && row.author_creation_request_id && own.some(r => r.author_creation_request_id === row.author_creation_request_id)) {
          // This is an idempotency token, not a duplicate archive record.
          await tx.execute(sql`update media_items set author_creation_request_id = null where id = ${row.id}`);
        }
        if (p.table === "tier_lists" && own.some(r => r.client_creation_id === row.client_creation_id)) {
          // A local draft may have been imported into both accounts. Keep both public links.
          await tx.execute(sql`update tier_lists set client_creation_id = gen_random_uuid() where id = ${row.id}`);
        }
        // A reaction can have cascaded away with a discarded review.
        if (p.table === "user_achievements") await tx.execute(sql`update user_achievements set announced_at = coalesce(announced_at, now()) where id = ${row.id}`);
        await transfer(tx, p, row, primary);
      }
    }
  }
  // Reassigning a review can also make the primary author's pre-existing reaction a self-reaction.
  onStep("remove-self-reactions");
  const selfReactions = await rows(tx, "review_reactions", sql`user_id = ${primary} and review_id in (select id from contributions where author_id = ${primary})`);
  for (const row of selfReactions) {
    await archive(tx, mergeId, secondary, "review_reactions", row, "merged-self-reaction");
    await deleteRow(tx, ACCOUNT_MERGE_POLICIES.find(p => p.table === "review_reactions")!, row);
  }
  onStep("transfer-friendships");
  const friendshipPolicy = ACCOUNT_MERGE_POLICIES.find(p => p.table === "author_friendships")!;
  const friendships = data.author_friendships;
  const primaryFriends = friendships.filter(r => r.first_author_id === primary || r.second_author_id === primary);
  const counterpart = (row: Row, author: number) => Number(row.first_author_id === author ? row.second_author_id : row.first_author_id);
  for (const row of friendships.filter(r => r.first_author_id === secondary || r.second_author_id === secondary)) {
    const other = counterpart(row, secondary);
    if (other === primary || primaryFriends.some(r => counterpart(r, primary) === other)) {
      await archive(tx, mergeId, secondary, "author_friendships", row);
      await deleteRow(tx, friendshipPolicy, row);
    } else {
      await tx.execute(sql`update author_friendships set first_author_id = ${Math.min(primary, other)}, second_author_id = ${Math.max(primary, other)}, requested_by_author_id = ${row.requested_by_author_id === secondary ? primary : row.requested_by_author_id} where id = ${row.id}`);
    }
  }
  // Consent provenance remains in private archive, including overlapping active versions.
  onStep("transfer-consents");
  for (const row of data.personal_data_consents.filter(r => r.author_id === secondary)) {
    await archive(tx, mergeId, secondary, "personal_data_consents", row, "consent-provenance");
    if (row.revoked_at === null && data.personal_data_consents.some(r => r.author_id === primary && r.version === row.version && r.revoked_at === null)) continue;
    await tx.execute(sql`update personal_data_consents set author_id = ${primary} where id = ${row.id}`);
  }
  onStep("reconcile-reputation");
  await reconcileMergedReputation(tx, { primaryAuthorId: primary, secondaryAuthorId: secondary, ratingAliases, reviewAliases, mergeId });
  // UPDATE/DELETE triggers already maintain rating aggregates; repair only affected records.
  onStep("refresh-rating-stats");
  const mediaIds = [...new Set(data.ratings.map(r => Number(r.media_item_id)))];
  if (mediaIds.length) {
    const affected = sql.join(mediaIds.map(n => sql`${n}`), sql`, `);
    await tx.execute(sql`select refresh_media_item_rating_stats(affected.id) from (select unnest(array[${affected}]::integer[]) as id) affected`);
  }
  onStep("close-source-profile");
  await tx.execute(sql`update authors set merged_into_author_id = ${primary}, is_discoverable = false,
    name_source_identity_id = null, avatar_source_identity_id = null, updated_at = now() where id = ${secondary}`);
}

function retryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; cause?: unknown };
  return ["40P01", "40001"].includes(value.code ?? "") || retryable(value.cause);
}
export async function confirmAccountMerge(input: MergeInput & { primaryAuthorId: number; version: string }) {
  for (let attempt = 0; ; attempt++) {
    let mergeStage = "lock";
    try {
      return await runInDomainEventTransaction(async (tx, appendEvent) => {
        await lockMerge(tx);
        if (!uuid.test(input.grantId)) throw new AccountMergeError("expired");
        const [completed] = await tx.select().from(accountMergeGrants).where(eq(accountMergeGrants.id, input.grantId)).for("update");
        if (completed?.consumedAt) {
          // A retry may only rotate a session belonging to this very completed merge.
          if (completed.resultAuthorId !== input.authorId || completed.resultSessionId !== input.sessionId) throw new AccountMergeError("session-changed");
          const previous = await activeSession(tx, input.authorId, input.sessionId);
          const token = generateAuthorSessionToken();
          const [fresh] = await tx.insert(authorSessions).values({ authorId: input.authorId, authMethod: previous.authMethod, identityId: previous.identityId, provider: previous.provider, tokenHash: hashAuthorSessionToken(token), expiresAt: new Date(Date.now() + AUTHOR_SESSION_MAX_AGE_SECONDS * 1000) }).returning();
          await tx.update(authorSessions).set({ revokedAt: new Date() }).where(eq(authorSessions.id, previous.id));
          await tx.update(accountMergeGrants).set({ resultSessionId: fresh.id }).where(eq(accountMergeGrants.id, input.grantId));
          return { authorId: input.authorId, token };
        }
        mergeStage = "validate-grant";
        const { grant, primary, secondary } = await checkedGrant(tx, input);
        mergeStage = "snapshot";
        const data = await snapshot(tx, [primary, secondary]);
        if (preview(input, primary, secondary, data).version !== input.version) throw new AccountMergeError("stale");
        const initiatingSession = await activeSession(tx, input.authorId, input.sessionId);
        mergeStage = "transfer-data";
        await applyMerge(tx, grant.id, primary, secondary, data, stage => { mergeStage = stage; });
        mergeStage = "create-session";
        const token = generateAuthorSessionToken();
        // Preserve a valid surviving identity; otherwise use the winner's password method.
        const [identity] = await tx.select().from(authorAuthIdentities).where(eq(authorAuthIdentities.authorId, primary)).limit(1);
        const [session] = await tx.insert(authorSessions).values({ authorId: primary, authMethod: identity ? "external" : initiatingSession.authMethod, identityId: identity?.id ?? null, provider: identity?.provider ?? null, tokenHash: hashAuthorSessionToken(token), expiresAt: new Date(Date.now() + AUTHOR_SESSION_MAX_AGE_SECONDS * 1000) }).returning();
        await tx.update(accountMergeGrants).set({ consumedAt: new Date(), resultAuthorId: primary, resultSessionId: session.id }).where(eq(accountMergeGrants.id, grant.id));
        mergeStage = "append-event";
        await appendEvent({ type: "author.accounts.merged", actorAuthorId: input.authorId, aggregateType: "author", aggregateId: String(primary), payload: { authorId: primary, sourceAuthorId: secondary, mergeId: grant.id } });
        return { authorId: primary, token };
      });
    } catch (error) {
      if (attempt < 2 && retryable(error)) continue;
      if (error instanceof AccountMergeError) throw error;
      const failure = error instanceof Error ? error : new Error("Account merge transaction failed");
      Object.assign(failure, { mergeStage });
      throw failure;
    }
  }
}
