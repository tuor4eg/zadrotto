"use client";

/* eslint-disable react-hooks/refs -- dnd-kit exposes imperative refs and transform state through useSortable. */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  Heading2,
  Images,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import type { AdminMediaBrowserItem } from "@/lib/admin/media-browser";
import { cn } from "@/lib/common/utils";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";

export type EditorialDocumentMediaBlock = {
  clientId: string;
  editorialComment: string;
  item: AdminMediaBrowserItem;
  type: "media";
};

export type EditorialDocumentHeadingBlock = {
  clientId: string;
  content: string;
  type: "heading";
};

export type EditorialDocumentTextBlock = {
  clientId: string;
  content: string;
  type: "text";
};

export type EditorialDocumentBlock =
  | EditorialDocumentMediaBlock
  | EditorialDocumentHeadingBlock
  | EditorialDocumentTextBlock;

export type EditorialDocumentEditorProps = {
  blocks: EditorialDocumentBlock[];
  onChange: (blocks: EditorialDocumentBlock[]) => void;
  onRequestMediaInsert: (index: number) => void;
};

type SortableBlockProps = {
  block: EditorialDocumentBlock;
  index: number;
  onChange: (block: EditorialDocumentBlock) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  totalCount: number;
};

function createClientId(type: EditorialDocumentHeadingBlock["type"] | EditorialDocumentTextBlock["type"]) {
  return `${type}-${crypto.randomUUID()}`;
}

function BlockControls({
  block,
  index,
  onMove,
  onRemove,
  sortable,
  totalCount,
}: Pick<SortableBlockProps, "block" | "index" | "onMove" | "onRemove" | "totalCount"> & {
  sortable: ReturnType<typeof useSortable>;
}) {
  const blockLabel = block.type === "media"
    ? `запись «${block.item.title}»`
    : block.type === "heading"
      ? "заголовок"
      : "текст";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      <Button
        aria-label={`Перетащить ${blockLabel}`}
        className="cursor-grab touch-none active:cursor-grabbing"
        size="icon"
        type="button"
        variant="ghost"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical />
      </Button>
      <Button
        aria-label={`Переместить ${blockLabel} выше`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
        size="icon"
        type="button"
        variant="outline"
      >
        <ArrowUp />
      </Button>
      <Button
        aria-label={`Переместить ${blockLabel} ниже`}
        disabled={index === totalCount - 1}
        onClick={() => onMove(1)}
        size="icon"
        type="button"
        variant="outline"
      >
        <ArrowDown />
      </Button>
      <Button
        aria-label={`Удалить ${blockLabel}`}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function MediaBlockEditor({
  block,
  onChange,
}: {
  block: EditorialDocumentMediaBlock;
  onChange: (block: EditorialDocumentMediaBlock) => void;
}) {
  const coverUrl = block.item.coverThumbUrl ?? block.item.coverUrl ?? undefined;

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-[5rem_minmax(0,1fr)]">
      <ImageWithFallback
        alt={`Обложка: ${block.item.title}`}
        className="h-28 w-20 rounded border border-stone-200 bg-stone-100 object-cover shadow-sm"
        fallback={
          <span
            aria-label={`Обложка не добавлена: ${block.item.title}`}
            className="grid h-28 w-20 place-items-center rounded border border-dashed border-stone-300 bg-stone-50 text-[10px] uppercase text-stone-400"
          >
            нет
          </span>
        }
        loading="lazy"
        src={coverUrl}
      />

      <div className="min-w-0">
        <div className="break-words font-medium text-stone-950">{block.item.title}</div>
        {block.item.originalTitle && block.item.originalTitle !== block.item.title ? (
          <div className="mt-1 truncate text-xs text-stone-500">{block.item.originalTitle}</div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">{block.item.mediaTypeLabel}</Badge>
          {block.item.releaseYear ? <Badge variant="outline">{block.item.releaseYear}</Badge> : null}
          <Badge variant="outline">Средняя: {formatScore(block.item.averageScore)}</Badge>
          <Badge variant="outline">{formatRatingsCount(block.item.ratingsCount)}</Badge>
        </div>

        <div className="mt-4 grid gap-2">
          <Label htmlFor={`editorial-comment-${block.clientId}`}>Редакционный комментарий</Label>
          <AutoResizeTextarea
            id={`editorial-comment-${block.clientId}`}
            maxLength={1000}
            onChange={(event) => onChange({
              ...block,
              editorialComment: event.currentTarget.value,
            })}
            placeholder="Необязательный комментарий к этой записи"
            value={block.editorialComment}
          />
          <span className="text-right text-xs tabular-nums text-stone-400">
            {block.editorialComment.length}/1000
          </span>
        </div>
      </div>
    </div>
  );
}

function SortableBlock({
  block,
  index,
  onChange,
  onMove,
  onRemove,
  totalCount,
}: SortableBlockProps) {
  const sortable = useSortable({ id: block.clientId });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const empty = block.type !== "media" && block.content.trim().length === 0;

  return (
    <article
      ref={sortable.setNodeRef}
      className={cn(
        "relative rounded-lg border bg-white p-4 shadow-sm",
        empty ? "border-amber-300 bg-amber-50/30" : "border-stone-200",
        sortable.isDragging && "z-20 opacity-70 shadow-lg",
      )}
      style={style}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <Badge variant={empty ? "warning" : "outline"}>
          {block.type === "media" ? "Запись" : block.type === "heading" ? "Заголовок" : "Текст"}
        </Badge>
        <BlockControls
          block={block}
          index={index}
          onMove={onMove}
          onRemove={onRemove}
          sortable={sortable}
          totalCount={totalCount}
        />
      </div>

      {block.type === "media" ? (
        <MediaBlockEditor block={block} onChange={onChange} />
      ) : block.type === "heading" ? (
        <div className="grid gap-2">
          <Label htmlFor={`editorial-heading-${block.clientId}`}>Заголовок раздела</Label>
          <Input
            className={empty ? "border-amber-400 bg-amber-50/40" : undefined}
            data-editorial-block-input={block.clientId}
            id={`editorial-heading-${block.clientId}`}
            maxLength={200}
            onChange={(event) => onChange({ ...block, content: event.currentTarget.value })}
            placeholder="Введите заголовок"
            value={block.content}
          />
          <span className="text-right text-xs tabular-nums text-stone-400">
            {block.content.length}/200
          </span>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`editorial-text-${block.clientId}`}>Текстовый блок</Label>
          <AutoResizeTextarea
            className={empty ? "border-amber-400 bg-amber-50/40" : undefined}
            data-editorial-block-input={block.clientId}
            id={`editorial-text-${block.clientId}`}
            maxLength={5000}
            onChange={(event) => onChange({ ...block, content: event.currentTarget.value })}
            placeholder="Введите текст"
            value={block.content}
          />
          <span className="text-right text-xs tabular-nums text-stone-400">
            {block.content.length}/5000
          </span>
        </div>
      )}
    </article>
  );
}

function InsertBlockControl({
  index,
  onInsertContent,
  onRequestMediaInsert,
  open,
  setOpen,
}: {
  index: number;
  onInsertContent: (index: number, type: "heading" | "text") => void;
  onRequestMediaInsert: (index: number) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [openAbove, setOpenAbove] = useState(false);

  function toggleMenu() {
    if (!open) {
      const triggerBounds = triggerRef.current?.getBoundingClientRect();
      const menuHeight = 164;

      setOpenAbove(Boolean(
        triggerBounds
        && window.innerHeight - triggerBounds.bottom < menuHeight
        && triggerBounds.top > menuHeight,
      ));
    }
    setOpen(!open);
  }

  return (
    <div ref={triggerRef} className="relative flex h-8 items-center justify-center" data-insert-index={index}>
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-300" />
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Добавить блок в позицию ${index + 1}`}
        className="relative z-10 size-7 rounded-full bg-white"
        onClick={toggleMenu}
        size="icon"
        type="button"
        variant="outline"
      >
        <Plus />
      </Button>

      {open ? (
        <div
          className={cn(
            "absolute left-1/2 z-30 grid min-w-52 -translate-x-1/2 gap-1 rounded-md border border-stone-200 bg-white p-1 shadow-lg",
            openAbove ? "bottom-full mb-1" : "top-full mt-1",
          )}
          role="menu"
        >
          <button
            className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
            onClick={() => {
              setOpen(false);
              onRequestMediaInsert(index);
            }}
            role="menuitem"
            type="button"
          >
            <Images className="size-4" />
            Добавить записи
          </button>
          <button
            className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
            onClick={() => {
              setOpen(false);
              onInsertContent(index, "heading");
            }}
            role="menuitem"
            type="button"
          >
            <Heading2 className="size-4" />
            Добавить заголовок
          </button>
          <button
            className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
            onClick={() => {
              setOpen(false);
              onInsertContent(index, "text");
            }}
            role="menuitem"
            type="button"
          >
            <FileText className="size-4" />
            Добавить текст
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function EditorialDocumentEditor({
  blocks,
  onChange,
  onRequestMediaInsert,
}: EditorialDocumentEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openInsertIndex, setOpenInsertIndex] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    setOpenInsertIndex(null);

    if (!event.over || event.active.id === event.over.id) {
      return;
    }

    const fromIndex = blocks.findIndex((block) => block.clientId === event.active.id);
    const toIndex = blocks.findIndex((block) => block.clientId === event.over?.id);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    onChange(arrayMove(blocks, fromIndex, toIndex));
  }

  function insertContentBlock(index: number, type: "heading" | "text") {
    const clientId = createClientId(type);
    const block = { clientId, content: "", type } satisfies EditorialDocumentBlock;

    onChange([...blocks.slice(0, index), block, ...blocks.slice(index)]);
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-editorial-block-input="${clientId}"]`)
        ?.focus();
    });
  }

  return (
    <div ref={rootRef} className="grid gap-1">
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={blocks.map((block) => block.clientId)}
          strategy={verticalListSortingStrategy}
        >
          <InsertBlockControl
            index={0}
            onInsertContent={insertContentBlock}
            onRequestMediaInsert={onRequestMediaInsert}
            open={openInsertIndex === 0}
            setOpen={(open) => setOpenInsertIndex(open ? 0 : null)}
          />

          {blocks.map((block, index) => (
            <div key={block.clientId}>
              <SortableBlock
                block={block}
                index={index}
                onChange={(nextBlock) => onChange(
                  blocks.map((currentBlock) =>
                    currentBlock.clientId === block.clientId ? nextBlock : currentBlock,
                  ),
                )}
                onMove={(offset) => onChange(arrayMove(blocks, index, index + offset))}
                onRemove={() => onChange(
                  blocks.filter((currentBlock) => currentBlock.clientId !== block.clientId),
                )}
                totalCount={blocks.length}
              />
              <InsertBlockControl
                index={index + 1}
                onInsertContent={insertContentBlock}
                onRequestMediaInsert={onRequestMediaInsert}
                open={openInsertIndex === index + 1}
                setOpen={(open) => setOpenInsertIndex(open ? index + 1 : null)}
              />
            </div>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
