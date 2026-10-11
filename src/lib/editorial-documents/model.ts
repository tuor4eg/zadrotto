export const MAX_EDITORIAL_DOCUMENT_BLOCKS = 300;
export const MAX_EDITORIAL_DOCUMENT_MEDIA_BLOCKS = 200;
export const MAX_EDITORIAL_MEDIA_COMMENT_LENGTH = 1_000;
export const MAX_EDITORIAL_HEADING_LENGTH = 200;
export const MAX_EDITORIAL_TEXT_LENGTH = 5_000;

export type EditorialDocumentBlockInput =
  | { type: "media"; mediaItemId: number; editorialComment: string | null }
  | { type: "heading"; content: string }
  | { type: "text"; content: string }
  | { type: "entry_group"; title: string | null; description: string | null; mediaItemIds: number[] };

export function getEditorialDocumentMediaIds(blocks: readonly EditorialDocumentBlockInput[]) {
  return blocks.flatMap((block) => block.type === "media"
    ? [block.mediaItemId]
    : block.type === "entry_group" ? block.mediaItemIds : []);
}

export type EditorialDocumentLimits = { maxBlocks: number; maxEntries: number };
export const DEFAULT_EDITORIAL_DOCUMENT_LIMITS: EditorialDocumentLimits = { maxBlocks: MAX_EDITORIAL_DOCUMENT_BLOCKS, maxEntries: MAX_EDITORIAL_DOCUMENT_MEDIA_BLOCKS };

export function assertEditorialDocumentBlocks(blocks: EditorialDocumentBlockInput[], limits: EditorialDocumentLimits = DEFAULT_EDITORIAL_DOCUMENT_LIMITS) {
  if (blocks.length > limits.maxBlocks) throw new Error(`blocks-limit:${limits.maxBlocks}`);
  const mediaIds = getEditorialDocumentMediaIds(blocks);
  if (mediaIds.length > limits.maxEntries) throw new Error(`media-blocks-limit:${limits.maxEntries}`);
  if (
    new Set(mediaIds).size !== mediaIds.length
    || mediaIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) throw new Error("blocks-invalid");

  for (const block of blocks) {
    switch (block.type) {
      case "media":
        if ((block.editorialComment?.length ?? 0) > MAX_EDITORIAL_MEDIA_COMMENT_LENGTH) throw new Error("comment-length");
        break;
      case "heading":
        if (!block.content.trim()) throw new Error("heading-empty");
        if (block.content.length > MAX_EDITORIAL_HEADING_LENGTH) throw new Error("heading-length");
        break;
      case "text":
        if (!block.content.trim()) throw new Error("text-empty");
        if (block.content.length > MAX_EDITORIAL_TEXT_LENGTH) throw new Error("text-length");
        break;
      case "entry_group":
        if (!block.mediaItemIds.length) throw new Error("group-empty");
        if ((block.title?.length ?? 0) > MAX_EDITORIAL_HEADING_LENGTH) throw new Error("group-title-length");
        if ((block.description?.length ?? 0) > MAX_EDITORIAL_TEXT_LENGTH) throw new Error("group-description-length");
        break;
      default:
        throw new Error("blocks-invalid");
    }
  }
}

export function parseEditorialDocumentBlocks(value: string, limits: EditorialDocumentLimits = DEFAULT_EDITORIAL_DOCUMENT_LIMITS): EditorialDocumentBlockInput[] {
  let blocks: EditorialDocumentBlockInput[];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    blocks = parsed.map((block) => {
      if (!block || typeof block !== "object") throw new Error();
      if (block.type === "media") return {
        type: "media" as const,
        mediaItemId: Number(block.mediaItemId),
        editorialComment: typeof block.editorialComment === "string" ? block.editorialComment.trim() || null : null,
      };
      if (block.type === "heading" || block.type === "text") return {
        type: block.type,
        content: typeof block.content === "string" ? block.content : "",
      };
      if (block.type === "entry_group") {
        if (!Array.isArray(block.mediaItemIds)
          || (block.title != null && typeof block.title !== "string")
          || (block.description != null && typeof block.description !== "string")) throw new Error();
        return {
          type: "entry_group" as const,
          title: block.title?.trim() || null,
          description: block.description?.trim() || null,
          mediaItemIds: block.mediaItemIds.map((id: unknown) => {
            if (typeof id !== "number") throw new Error();
            return id;
          }),
        };
      }
      throw new Error();
    });
  } catch {
    throw new Error("blocks-invalid");
  }
  assertEditorialDocumentBlocks(blocks, limits);
  return blocks;
}

