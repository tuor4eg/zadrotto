export const MAX_EDITORIAL_DOCUMENT_BLOCKS = 300;
export const MAX_EDITORIAL_DOCUMENT_MEDIA_BLOCKS = 200;
export const MAX_EDITORIAL_MEDIA_COMMENT_LENGTH = 1_000;
export const MAX_EDITORIAL_HEADING_LENGTH = 200;
export const MAX_EDITORIAL_TEXT_LENGTH = 5_000;

export type EditorialDocumentBlockInput =
  | { type: "media"; mediaItemId: number; editorialComment: string | null }
  | { type: "heading"; content: string }
  | { type: "text"; content: string };

