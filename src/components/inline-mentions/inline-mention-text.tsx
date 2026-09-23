import Link from "next/link"

import type {
  InlineNode,
  ResolvedInlineEntity,
} from "@/lib/inline-mentions/markup"

type InlineMentionTextProps = {
  nodes: InlineNode[]
  resolvedEntities: ResolvedInlineEntity[]
}

function getEntityKey(type: string, id: string) {
  return `${type}:${id}`
}

export function InlineMentionText({
  nodes,
  resolvedEntities,
}: InlineMentionTextProps) {
  const resolvedByKey = new Map(
    resolvedEntities.map((entity) => [getEntityKey(entity.type, entity.id), entity]),
  )

  return nodes.map((node, index) => {
    if (node.type === "text") {
      return <span key={`text-${index}`}>{node.value}</span>
    }

    const resolved = resolvedByKey.get(getEntityKey(node.entityType, node.id))
    if (!resolved) {
      return <span key={`entity-${index}`}>{node.label}</span>
    }

    return (
      <Link
        key={`entity-${index}`}
        href={resolved.href}
        className="font-medium text-red-950 underline decoration-red-950/35 underline-offset-4 transition-colors hover:decoration-red-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-950"
      >
        {node.label}
      </Link>
    )
  })
}
