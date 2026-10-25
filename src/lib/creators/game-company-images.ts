import { enqueueCreatorImageFill } from "@/db/queries/creator-image-jobs";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { getRedisClient } from "@/lib/services/redis";
import { creators, gameCompanyProfiles, providerCreatorBindings } from "@/db/schema";
import { getCoverProviderCredentialsForSearch } from "@/db/queries/cover-settings";
import { fetchGameCompanyProfiles } from "./game-company-api";
import { isGameCompanyId, type GameCompanyProvider } from "./game-companies";
import { fetchProviderImage } from "@/lib/covers/provider-image-relay";
import { AVATAR_MAX_BYTES, AVATAR_MAX_INPUT_PIXELS, AVATAR_OUTPUT_SIZE } from "@/lib/avatars/config";
import { fetchS3Object, uploadS3Object } from "@/lib/services/minio";
import { uploadProcessedCreatorAvatarBuffer, deleteCreatorAvatarBestEffort } from "./avatar-storage";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { GameProviderDeferredError } from "@/lib/covers/game-provider-budget";

export class GameCompanyImageError extends Error {
  constructor(readonly externalIds: string[]) { super("Не удалось сохранить логотипы организаций."); }
}

const EXTERNAL_IMAGE_KEY = /^avatars\/external-companies\/(igdb|rawg|tmdb)\/[a-z]+-[1-9]\d*\/[a-f0-9]{64}\.webp$/;
export function getExternalCompanyImageUrl(objectKey: string | null) {
  return objectKey && EXTERNAL_IMAGE_KEY.test(objectKey) ? `/company-images/${objectKey.slice("avatars/external-companies/".length)}` : null;
}
export function isExternalCompanyImageKey(objectKey: string) { return EXTERNAL_IMAGE_KEY.test(objectKey); }

/** Logos retain their complete geometry; photographic Creator avatars keep their existing crop. */
export async function transformCompanyLogo(buffer: Buffer) {
  if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) throw new Error("Изображение слишком большое.");
  const image = sharp(buffer, { animated: false, limitInputPixels: AVATAR_MAX_INPUT_PIXELS, pages: 1 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Некорректное изображение организации.");
  return image.rotate().resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 84 }).toBuffer();
}

/** One provider enrichment lease makes the persistent cache shared across concurrent import jobs. */
export async function enrichGameCompanyProfiles(provider: GameCompanyProvider, externalIds: string[], signal?: AbortSignal, backfill = false, jobGuard?: SnapshotJobGuard) {
  if (!externalIds.length) return;
  signal?.throwIfAborted();
  const redis = await getRedisClient().catch(() => null);
  if (!redis) throw new GameProviderDeferredError("rate-limit-unavailable", 60);
  const key = `game-companies:enrichment:${provider}`;
  const owner = randomUUID();
  const claimed = await redis.set(key, owner, { NX: true, PX: 120000 }).catch(() => null);
  if (!claimed) throw new GameProviderDeferredError("provider-rate-limit", 1);
  const lease = new AbortController();
  const combined = signal ? AbortSignal.any([signal, lease.signal]) : lease.signal;
  const heartbeat = setInterval(() => {
    void redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],120000) else return 0 end", { keys: [key], arguments: [owner] })
      .then(result => { if (Number(result) !== 1) lease.abort(); }).catch(() => lease.abort());
  }, 30000);
  try { await enrichProfilesUnderLease(provider, externalIds, combined, backfill, jobGuard); }
  finally {
    clearInterval(heartbeat);
    await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", { keys: [key], arguments: [owner] }).catch(() => {});
  }
}
async function enrichProfilesUnderLease(provider: GameCompanyProvider, externalIds: string[], signal?: AbortSignal, backfill = false, jobGuard?: SnapshotJobGuard) {
  const ids = [...new Set(externalIds)].sort();
  if (ids.some(id => !isGameCompanyId(provider, id))) throw new Error("Некорректный ID организации.");
  if (!ids.length) return;
  await withSnapshotJobGuard(jobGuard, async tx => {
    for (const id of ids) await tx.insert(gameCompanyProfiles).values({ provider, externalId: id, name: id }).onConflictDoNothing();
  });
  const cached = await db.select().from(gameCompanyProfiles).where(and(eq(gameCompanyProfiles.provider, provider), inArray(gameCompanyProfiles.externalId, ids)));
  const pending = cached.filter(row => row.profileStatus === "pending").map(row => row.externalId);
  const credentials = pending.length ? await getCoverProviderCredentialsForSearch() : undefined;
  // Persist each RAWG response before requesting another identity: rate deferral must not lose work.
  for (let offset = 0; offset < pending.length; offset += provider === "igdb" ? 100 : 1) {
    signal?.throwIfAborted();
    const batch = pending.slice(offset, offset + (provider === "igdb" ? 100 : 1));
    const profiles = await fetchGameCompanyProfiles(provider, batch, { providerCredentials: credentials, backfill, signal, jobGuard });
    signal?.throwIfAborted();
    for (const id of batch) {
      const profile = profiles.find(row => row.externalId === id);
      await withSnapshotJobGuard(jobGuard, async tx => {
        await tx.update(gameCompanyProfiles).set(profile ? { name: profile.name, sourceUrl: profile.sourceUrl, details: profile.details, imageUrl: profile.imageUrl, profileStatus: "ready", fetchedAt: new Date(), error: null, updatedAt: new Date(), ...(!profile.imageUrl ? { imageStatus: "missing" } : {}) } : { profileStatus: "missing", imageStatus: "missing", fetchedAt: new Date(), updatedAt: new Date() }).where(and(eq(gameCompanyProfiles.provider, provider), eq(gameCompanyProfiles.externalId, id)));
      });
    }
  }
  const rows = await db.select().from(gameCompanyProfiles).where(and(eq(gameCompanyProfiles.provider, provider), inArray(gameCompanyProfiles.externalId, ids)));
  const failedImages: string[] = [];
  for (const row of rows) {
    signal?.throwIfAborted();
    if (row.imageStatus !== "pending") continue;
    if (!row.imageUrl || provider !== "igdb") continue;
    try {
      const image = await fetchProviderImage({ providerCode: provider, imageUrl: row.imageUrl, maxBytes: AVATAR_MAX_BYTES });
      if (!image.ok) throw new Error("Не удалось загрузить логотип организации.");
      const body = await transformCompanyLogo(image.body);
      const contentHash = createHash("sha256").update(body).digest("hex");
      const objectKey = `avatars/external-companies/${provider}/${row.externalId.replace(":", "-")}/${contentHash}.webp`;
      signal?.throwIfAborted();
      await uploadS3Object({ objectKey, body, contentType: "image/webp" });
      signal?.throwIfAborted();
      await withSnapshotJobGuard(jobGuard, async tx => {
        await tx.update(gameCompanyProfiles).set({ imageObjectKey: objectKey, imageContentHash: contentHash, imageStatus: "ready", error: null, updatedAt: new Date() }).where(and(eq(gameCompanyProfiles.provider, provider), eq(gameCompanyProfiles.externalId, row.externalId)));
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && "code" in error && error.code === "lease-lost") throw error;
      await withSnapshotJobGuard(jobGuard, async tx => {
        await tx.update(gameCompanyProfiles).set({ error: "Не удалось сохранить логотип организации.", updatedAt: new Date() }).where(and(eq(gameCompanyProfiles.provider, provider), eq(gameCompanyProfiles.externalId, row.externalId)));
      });
      failedImages.push(row.externalId);
    }
  }
  const bindings = await db.select({ creatorId: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, provider), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, ids)));
  await withSnapshotJobGuard(jobGuard, async tx => {
    for (const id of [...new Set(bindings.map(row => row.creatorId))].sort((a, b) => a - b)) await enqueueCreatorImageFill(tx, id);
  });
  const { autoApproveGameCompanyRequests } = await import("@/db/queries/creator-requests");
  await autoApproveGameCompanyRequests({ provider, externalIds: ids, signal, jobGuard });
  if (failedImages.length) throw new GameCompanyImageError(failedImages);
}

/** Use only saved, confirmed evidence. No provider API is contacted during moderation apply. */
export async function syncGameCompanyAvatar(creatorId: number, dependencies: Partial<{ fetchLocal: typeof fetchS3Object; upload: typeof uploadProcessedCreatorAvatarBuffer; cleanup: typeof deleteCreatorAvatarBestEffort }> = {}, jobGuard?: SnapshotJobGuard) {
  const fetchLocal = dependencies.fetchLocal ?? fetchS3Object;
  const upload = dependencies.upload ?? uploadProcessedCreatorAvatarBuffer;
  const cleanup = dependencies.cleanup ?? deleteCreatorAvatarBestEffort;
  const [creator] = await db.select().from(creators).where(eq(creators.id, creatorId));
  if (!creator || creator.avatarSource === "manual") return;
  const candidates = await db.select({ bindingId: providerCreatorBindings.id, externalId: gameCompanyProfiles.externalId, objectKey: gameCompanyProfiles.imageObjectKey, contentHash: gameCompanyProfiles.imageContentHash, originalUrl: gameCompanyProfiles.imageUrl, sourceUrl: gameCompanyProfiles.sourceUrl }).from(providerCreatorBindings).innerJoin(gameCompanyProfiles, and(eq(gameCompanyProfiles.provider, providerCreatorBindings.provider), eq(gameCompanyProfiles.externalId, providerCreatorBindings.externalCreatorId))).where(and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true), eq(providerCreatorBindings.provider, "igdb"), eq(gameCompanyProfiles.imageStatus, "ready"))).orderBy(asc(sql`split_part(${gameCompanyProfiles.externalId}, ':', 2)::bigint`));
  const candidate = candidates[0];
  if (!candidate?.objectKey || !candidate.contentHash || !candidate.originalUrl || !candidate.sourceUrl) return;
  if (creator.avatarContentHash === candidate.contentHash && creator.avatarSource === "igdb" && creator.avatarSourceExternalId === candidate.externalId) return;
  const local = await fetchLocal({ objectKey: candidate.objectKey });
  if (!local?.body) throw new Error("Локальный логотип организации недоступен.");
  const body = Buffer.from(await new Response(local.body).arrayBuffer());
  const uploaded = await upload({ creatorId, body });
  let committed = false;
  try {
    const result = await withSnapshotJobGuard(jobGuard, async tx => {
      const [current] = await tx.select().from(creators).where(eq(creators.id, creatorId)).for("update");
      if (!current || current.avatarSource === "manual" || current.avatarVersion !== creator.avatarVersion) return undefined;
      const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.id, candidate.bindingId), eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true)));
      if (!binding) return undefined;
      // Re-evaluate deterministic priority after the network/storage operation.
      const [preferred] = await tx.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).innerJoin(gameCompanyProfiles, and(eq(gameCompanyProfiles.provider, providerCreatorBindings.provider), eq(gameCompanyProfiles.externalId, providerCreatorBindings.externalCreatorId))).where(and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true), eq(providerCreatorBindings.provider, "igdb"), eq(gameCompanyProfiles.imageStatus, "ready"))).orderBy(asc(sql`split_part(${gameCompanyProfiles.externalId}, ':', 2)::bigint`)).limit(1);
      if (preferred?.id !== candidate.bindingId) return undefined;
      await tx.update(creators).set({ avatarObjectKey: uploaded.objectKey, avatarContentHash: uploaded.contentHash, avatarSource: "igdb", avatarSourceExternalId: candidate.externalId, avatarSourceUrl: candidate.sourceUrl, avatarOriginalUrl: candidate.originalUrl, avatarFetchedAt: new Date(), avatarVersion: current.avatarVersion + 1, updatedAt: new Date() }).where(eq(creators.id, creatorId));
      return { previousObjectKey: current.avatarObjectKey };
    });
    committed = result !== undefined;
    if (result) await cleanup(result.previousObjectKey);
  } finally { if (!committed) await cleanup(uploaded.objectKey); }
}

export const gameCompanyEnrichHandler: JobHandlerDefinition<{ provider: GameCompanyProvider; externalIds: string[] }> = {
  type: "media.game-company-enrich", label: "Сведения и логотипы игровых организаций", schedulable: false,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  parsePayload(value) {
    const row = value as { provider?: string; externalIds?: unknown };
    if (!row || (row.provider !== "igdb" && row.provider !== "rawg") || !Array.isArray(row.externalIds) || row.externalIds.length > 1000 || row.externalIds.some(id => typeof id !== "string" || !isGameCompanyId(row.provider!, id))) throw new Error("Некорректные параметры организаций.");
    return { provider: row.provider, externalIds: row.externalIds as string[] };
  },
  async execute({ payload, signal, runId, lockToken }) {
    try { await enrichGameCompanyProfiles(payload.provider, payload.externalIds, signal, false, lockToken ? { runId, lockToken } : undefined); }
    catch (error) {
      if (error instanceof GameProviderDeferredError) throw new JobError(error.code, "Ожидание доступного лимита провайдера.", { deferSeconds: error.retryAfterSeconds });
      throw error;
    }
  },
};
