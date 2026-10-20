import { eq } from "drizzle-orm";
import { creators, mediaItems } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";

export type SnapshotActor = { kind: "system" | "admin" } | { kind: "author"; authorId: number };
export type SnapshotEntity = { entityType: string; entityId: string };
export type SnapshotEntityHandler = {
  canonicalId: (value: string) => string;
  lock: (tx: DbTransaction, id: string, actor: SnapshotActor) => Promise<void>;
};
function positiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("INVALID_SNAPSHOT_ENTITY_ID");
  return String(Number(value));
}
const handlers = new Map<string, SnapshotEntityHandler>([
  ["media-item", { canonicalId: positiveId, async lock(tx,id,actor) {
    const [row] = await tx.select({id:mediaItems.id,authorId:mediaItems.createdByAuthorId,status:mediaItems.publicationStatus})
      .from(mediaItems).where(eq(mediaItems.id,Number(id))).for("update");
    if (!row) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
    if (actor.kind === "author" && (row.authorId !== actor.authorId || !["private","rejected"].includes(row.status))) throw new Error("SNAPSHOT_ENTITY_FORBIDDEN");
  }}],
  ["creator", { canonicalId: positiveId, async lock(tx,id,actor) {
    if (actor.kind === "author") throw new Error("SNAPSHOT_ENTITY_FORBIDDEN");
    const [row] = await tx.select({id:creators.id}).from(creators).where(eq(creators.id,Number(id))).for("update");
    if (!row) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
  }}],
]);
/** Registration is server code, never a request parameter or SQL table name. */
export function registerSnapshotEntityType(type: string, handler: SnapshotEntityHandler) {
  if (!/^[a-z][a-z0-9-]*$/.test(type) || handlers.has(type)) throw new Error("INVALID_SNAPSHOT_ENTITY_TYPE");
  handlers.set(type,handler);
}
export function canonicalSnapshotEntity(entity: SnapshotEntity): SnapshotEntity {
  const handler = handlers.get(entity.entityType);
  if (!handler) throw new Error("UNKNOWN_SNAPSHOT_ENTITY_TYPE");
  return {...entity,entityId:handler.canonicalId(entity.entityId)};
}
export async function lockSnapshotEntity(tx: DbTransaction, entity: SnapshotEntity, actor: SnapshotActor) {
  const canonical = canonicalSnapshotEntity(entity);
  await handlers.get(canonical.entityType)!.lock(tx,canonical.entityId,actor);
  return canonical;
}
