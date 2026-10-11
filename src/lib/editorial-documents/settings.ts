import type { EditorialDocumentLimits } from "./model";

export function parseCollectionLimit(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 2_147_483_647 ? number : null;
}

export function parseCollectionSettings(input: { maxBlocks: unknown; maxEntries: unknown }): EditorialDocumentLimits | null {
  const maxBlocks = parseCollectionLimit(input.maxBlocks);
  const maxEntries = parseCollectionLimit(input.maxEntries);
  return maxBlocks === null || maxEntries === null ? null : { maxBlocks, maxEntries };
}
