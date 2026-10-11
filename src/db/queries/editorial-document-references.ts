import { sql, type SQLWrapper } from "drizzle-orm";

import { editorialDocumentBlockItems, editorialDocumentBlocks } from "@/db/schema";

// Both kinds of inclusion share publication, counting and reference rules.
export function editorialDocumentMediaReferencesSql(documentId: SQLWrapper) {
  return sql`
    select ${editorialDocumentBlocks.mediaItemId} as media_item_id
    from ${editorialDocumentBlocks}
    where ${editorialDocumentBlocks.documentId} = ${documentId}
      and ${editorialDocumentBlocks.blockType} = 'media'
    union all
    select ${editorialDocumentBlockItems.mediaItemId} as media_item_id
    from ${editorialDocumentBlocks}
    inner join ${editorialDocumentBlockItems}
      on ${editorialDocumentBlockItems.blockId} = ${editorialDocumentBlocks.id}
    where ${editorialDocumentBlocks.documentId} = ${documentId}
      and ${editorialDocumentBlocks.blockType}::text = 'entry_group'
  `;
}

export function editorialDocumentItemsCountSql(documentId: SQLWrapper) {
  return sql<number>`(select count(*)::int from (${editorialDocumentMediaReferencesSql(documentId)}) as document_entries)`;
}

export function mediaItemHasEditorialReferenceSql(mediaItemId: number) {
  return sql<boolean>`(
    exists (select 1 from ${editorialDocumentBlocks}
      where ${editorialDocumentBlocks.mediaItemId} = ${mediaItemId}
        and ${editorialDocumentBlocks.blockType} = 'media')
    or exists (select 1 from ${editorialDocumentBlockItems}
      where ${editorialDocumentBlockItems.mediaItemId} = ${mediaItemId})
  )`;
}
