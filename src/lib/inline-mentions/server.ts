import "server-only";

import { resolvePublishedMediaItemsByIds } from "@/db/queries/inline-mention-media-items";
import {
  parseInlineMarkup,
  type InlineNode,
  type ResolvedInlineEntity,
} from "@/lib/inline-mentions/markup";

export type ResolvedInlineNode = InlineNode & { href?: string };

type InlineEntityResolverContext = {
  accessibleMediaTypeCodes: readonly string[];
};

type InlineEntityHandler = {
  resolveMany(
    ids: readonly string[],
    context: InlineEntityResolverContext,
  ): Promise<Map<string, ResolvedInlineEntity>>;
};

const INLINE_ENTITY_HANDLERS: Record<string, InlineEntityHandler> = {
  title: {
    async resolveMany(ids, context) {
      const numericIds = ids
        .filter((id) => /^\d+$/.test(id))
        .map(Number)
        .filter(Number.isSafeInteger);
      const items = await resolvePublishedMediaItemsByIds({
        ids: numericIds,
        accessibleMediaTypeCodes: context.accessibleMediaTypeCodes,
      });

      return new Map(items.map((item) => [String(item.id), {
        type: "title",
        id: String(item.id),
        href: `/media/${encodeURIComponent(item.code)}`,
      }]));
    },
  },
};

export async function resolveInlineNodes(
  nodes: readonly InlineNode[],
  context: InlineEntityResolverContext,
): Promise<ResolvedInlineNode[]> {
  const idsByType = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (node.type !== "entity" || !INLINE_ENTITY_HANDLERS[node.entityType]) continue;
    const ids = idsByType.get(node.entityType) ?? new Set<string>();
    ids.add(node.id);
    idsByType.set(node.entityType, ids);
  }

  const resolvedByType = new Map<string, Map<string, ResolvedInlineEntity>>();
  await Promise.all([...idsByType].map(async ([entityType, ids]) => {
    const resolved = await INLINE_ENTITY_HANDLERS[entityType].resolveMany([...ids], context);
    resolvedByType.set(entityType, resolved);
  }));

  return nodes.map((node) => {
    if (node.type === "text") return node;
    const resolved = resolvedByType.get(node.entityType)?.get(node.id);
    return resolved ? { ...node, href: resolved.href } : node;
  });
}

export async function resolveInlineEntities(
  nodes: readonly InlineNode[],
  context: InlineEntityResolverContext,
): Promise<ResolvedInlineEntity[]> {
  const resolvedNodes = await resolveInlineNodes(nodes, context);
  return resolvedNodes.flatMap((node) => (
    node.type === "entity" && node.href
      ? [{ type: node.entityType, id: node.id, href: node.href }]
      : []
  ));
}

export async function parseAndResolveInlineMarkup(
  value: string,
  context: InlineEntityResolverContext,
) {
  return resolveInlineNodes(parseInlineMarkup(value), context);
}
