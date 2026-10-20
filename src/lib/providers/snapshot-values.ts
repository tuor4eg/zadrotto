import { createHash } from "node:crypto";
import type { JSONValue, SnapshotDescriptor } from "./types";

export type SnapshotReference = { id: number; payloadHash: string };

export function canonicalJson(value: JSONValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function snapshotHash(value: JSONValue) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export function snapshotIdentity(input: SnapshotDescriptor) {
  return [input.providerCode,input.resourceType,input.externalId,input.apiMethod,snapshotHash(input.requestParams)].join(":");
}
export function validateSnapshotReferences(value: unknown): value is SnapshotReference[] {
  return Array.isArray(value) && value.length > 0 && value.every((ref) =>
    ref && typeof ref === "object" && Number.isSafeInteger(ref.id) && ref.id > 0 && typeof ref.payloadHash === "string" && /^[a-f0-9]{64}$/.test(ref.payloadHash))
    && new Set(value.map((ref) => ref.id)).size === value.length;
}
