import type { ReactNode } from "react";

import { cn } from "@/lib/common/utils";

type EditorialDocumentContentBlock = {
  id: number;
  position: number;
  type: "heading" | "text";
  content: string;
};

type EditorialDocumentMediaBlock = {
  id: number;
  position: number;
  type: "media";
  item: unknown;
};

type EditorialDocumentEntryGroupBlock = {
  id: number;
  position: number;
  type: "entry_group";
};

export function EditorialDocumentRenderer<
  TMediaBlock extends EditorialDocumentMediaBlock,
  TEntryGroupBlock extends EditorialDocumentEntryGroupBlock,
>({
  blocks,
  mediaGroupClassName,
  renderMedia,
  renderEntryGroup,
}: {
  blocks: Array<EditorialDocumentContentBlock | TMediaBlock | TEntryGroupBlock>;
  mediaGroupClassName?: string;
  renderMedia: (block: TMediaBlock, mediaNumber: number) => ReactNode;
  renderEntryGroup: (block: TEntryGroupBlock) => ReactNode;
}) {
  const sections: ReactNode[] = [];
  let mediaGroup: Array<TMediaBlock | TEntryGroupBlock> = [];
  let mediaNumber = 0;

  function flushMediaGroup(key: string) {
    if (!mediaGroup.length) return;
    const group = mediaGroup;
    mediaGroup = [];
    sections.push(<div key={key} className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", mediaGroupClassName)}>
      {group.map((block) => {
        if (block.type === "entry_group") {
          return <div key={block.id} className="min-w-0">{renderEntryGroup(block)}</div>;
        }
        mediaNumber += 1;
        return renderMedia(block, mediaNumber);
      })}
    </div>);
  }

  for (const block of blocks) {
    if (block.type === "media" || block.type === "entry_group") {
      mediaGroup.push(block);
      continue;
    }
    flushMediaGroup(`media-before-${block.id}`);
    sections.push(block.type === "heading"
      ? <h2 key={block.id} className="-mb-4 font-serif text-3xl leading-tight text-stone-950 sm:text-4xl">{block.content}</h2>
      : <div key={block.id} className="whitespace-pre-wrap text-base leading-7 text-stone-700">{block.content}</div>);
  }
  flushMediaGroup("media-end");

  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8 border-t border-stone-950/10 p-5 sm:p-7">{sections}</div>;
}
