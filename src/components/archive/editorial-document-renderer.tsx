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

export function EditorialDocumentRenderer<TMediaBlock extends EditorialDocumentMediaBlock>({
  blocks,
  mediaGroupClassName,
  renderMedia,
}: {
  blocks: Array<EditorialDocumentContentBlock | TMediaBlock>;
  mediaGroupClassName?: string;
  renderMedia: (block: TMediaBlock, mediaNumber: number) => ReactNode;
}) {
  const sections: ReactNode[] = [];
  let mediaGroup: TMediaBlock[] = [];
  let mediaNumber = 0;

  function flushMediaGroup(key: string) {
    if (!mediaGroup.length) return;
    const group = mediaGroup;
    mediaGroup = [];
    sections.push(<div key={key} className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", mediaGroupClassName)}>
      {group.map((block) => {
        mediaNumber += 1;
        return renderMedia(block, mediaNumber);
      })}
    </div>);
  }

  for (const block of blocks) {
    if (block.type === "media") {
      mediaGroup.push(block as TMediaBlock);
      continue;
    }
    flushMediaGroup(`media-before-${block.id}`);
    sections.push(block.type === "heading"
      ? <h2 key={block.id} className="font-serif text-3xl leading-tight text-stone-950 sm:text-4xl">{block.content}</h2>
      : <div key={block.id} className="whitespace-pre-wrap text-base leading-7 text-stone-700">{block.content}</div>);
  }
  flushMediaGroup("media-end");

  return <div className="grid gap-8 border-t border-stone-950/10 p-5 sm:p-7">{sections}</div>;
}
