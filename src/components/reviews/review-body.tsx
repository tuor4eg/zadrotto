import Link from "next/link"
import { renderToReactElement } from "@tiptap/static-renderer/pm/react"

import { InlineMentionText } from "@/components/inline-mentions/inline-mention-text"
import type { ResolvedInlineEntity } from "@/lib/inline-mentions/markup"
import { parseInlineMarkup } from "@/lib/inline-mentions/markup"
import { isReviewLinkAllowed, reviewBodyToDocument, reviewExtensions, type ReviewBodyFormat } from "@/lib/reviews/body"

export const reviewTextClassName = "[overflow-wrap:anywhere] text-[15px] leading-7 text-stone-800 sm:text-base sm:leading-8 [&_p]:min-h-[1lh] [&_p]:m-0 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-stone-300 [&_blockquote]:pl-4 [&_blockquote]:text-stone-600 [&_a]:font-medium [&_a]:text-red-950 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:decoration-red-950 [&_a:focus-visible]:outline [&_a:focus-visible]:outline-offset-2"

export function ReviewBody({ body, format = "plain", resolvedEntities = [] }: {
  body: string
  format?: ReviewBodyFormat
  resolvedEntities?: ResolvedInlineEntity[]
}) {
  if (format === "plain") return <p className="whitespace-pre-wrap"><InlineMentionText nodes={parseInlineMarkup(body)} resolvedEntities={resolvedEntities} /></p>
  return renderToReactElement({
    extensions: reviewExtensions,
    content: reviewBodyToDocument(body, format),
    options: {
      nodeMapping: {
        mention: ({ node }) => {
          const { entityType, id, label } = node.attrs
          const entity = resolvedEntities.find((entry) => entry.type === entityType && entry.id === id)
          return entity ? <Link href={entity.href}>{label}</Link> : <span>{label}</span>
        },
      },
      markMapping: {
        link: ({ mark, children }) => isReviewLinkAllowed(mark.attrs.href)
          ? <a href={mark.attrs.href} rel="nofollow ugc noopener noreferrer">{children}</a>
          : <>{children}</>,
      },
    },
  })
}
