"use client";

import { Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Label } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { getAdminMediaItemTagGroups } from "@/db/queries/tags";
import { normalizeSearchText } from "@/lib/search/normalize";
import { useTagSearch } from "@/lib/tags/use-tag-search";

import { EmptyState } from "../../../admin-ui";
import { changeMediaTagAction, submitMediaTagAction } from "./media-tag-actions";

type TagGroup = Awaited<ReturnType<typeof getAdminMediaItemTagGroups>>[number];

function TagNameDialog({ mediaItemId, tag, onClose }: {
  mediaItemId: number;
  tag: TagGroup | null;
  onClose: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(tag?.title ?? "");
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const searchQuery = selectedTitle === title || title === tag?.title ? "" : normalizeSearchText(title);
  const search = useTagSearch(searchQuery);
  const suggestions = search?.items.filter(({ id }) => id !== tag?.id) ?? [];
  const hasExistingTag = selectedTitle === title ||
    Boolean(search?.items.some((option) => normalizeSearchText(option.title) === searchQuery));

  const [state, action, pending] = useActionState(async (_previous: { error: string | null }, data: FormData) => {
    const result = await changeMediaTagAction(mediaItemId, data);
    if (!result.error) onClose();
    return result;
  }, { error: null });

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-heading`}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-stone-200 bg-white p-5 shadow-xl backdrop:bg-stone-950/45"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id={`${id}-heading`} className="text-lg font-semibold">{tag ? "Изменить тег" : "Добавить тег"}</h2>
      <form action={action} className="mt-4 grid gap-3">
        <input type="hidden" name="operation" value={tag ? "rename" : "add"} />
        {tag && <input type="hidden" name="tagId" value={tag.id} />}
        <Label htmlFor={`${id}-title`}>Название тега</Label>
        <SearchInput
          id={`${id}-title`}
          name="title"
          value={title}
          placeholder="Найти или ввести название"
          maxLength={80}
          required
          readOnly={pending}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setSelectedTitle(null);
          }}
        />
        {suggestions.length > 0 && (
          <ul aria-label="Существующие теги" className="max-h-48 overflow-y-auto rounded-md border border-stone-200 p-1">
            {suggestions.map((option) => (
              <li key={option.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="h-auto w-full justify-start whitespace-normal break-words text-left"
                  onClick={() => {
                    setTitle(option.title);
                    setSelectedTitle(option.title);
                  }}
                >
                  {option.title}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {searchQuery && !suggestions.length && (
          <p role={search?.error ? "alert" : "status"} className="text-xs text-stone-500">
            {search?.error ?? (search ? "Подходящих тегов не найдено." : "Поиск…")}
          </p>
        )}
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Отмена</Button>
          <Button type="submit" disabled={pending}>{tag ? "Сохранить" : hasExistingTag ? "Закрепить" : "Добавить"}</Button>
        </div>
      </form>
    </dialog>
  );
}

function TagGroupActions({ mediaItemId, tag, onRename }: {
  mediaItemId: number;
  tag: TagGroup;
  onRename: () => void;
}) {
  const submit = submitMediaTagAction.bind(null, mediaItemId);
  const pinLabel = tag.editorial ? "Открепить" : "Закрепить";

  return (
    <div className="flex gap-2">
      <form action={submit}>
        <input type="hidden" name="tagId" value={tag.id} />
        <input type="hidden" name="operation" value={tag.editorial ? "unpin" : "pin"} />
        <Button type="submit" variant="outline" size="icon" aria-label={`${pinLabel} «${tag.title}»`} title={pinLabel}>
          {tag.editorial ? <PinOff aria-hidden /> : <Pin aria-hidden />}
        </Button>
      </form>
      {tag.editorial && tag.count === 1 && (
        <Button type="button" variant="outline" size="icon" onClick={onRename} aria-label={`Изменить «${tag.title}»`} title="Изменить">
          <Pencil aria-hidden />
        </Button>
      )}
      {!tag.editorial && (
        <ConfirmAction
          action={submit}
          fields={[{ name: "operation", value: "delete" }, { name: "tagId", value: tag.id }]}
          title="Удалить тег у записи?"
          description={`Все назначения тега «${tag.title}» у этой записи будут удалены.`}
          confirmLabel="Удалить"
          triggerLabel="Удалить"
          triggerAriaLabel={`Удалить «${tag.title}» у записи`}
          triggerIcon={<Trash2 aria-hidden />}
          triggerSize="icon"
          triggerVariant="outline"
        />
      )}
    </div>
  );
}

export function MediaTagsTab({ mediaItemId, tags }: { mediaItemId: number; tags: TagGroup[] }) {
  const [dialogTag, setDialogTag] = useState<TagGroup | null | undefined>(undefined);

  return (
    <div className="grid gap-4">
      <Button type="button" className="justify-self-start" onClick={() => setDialogTag(null)}>
        <Plus aria-hidden /> Добавить тег
      </Button>
      {tags.length ? (
        <>
          <TableWrap className="hidden md:block">
            <Table>
              <THead><TR><TH>Тег</TH><TH>Назначения</TH><TH>Статус</TH><TH>Действия</TH></TR></THead>
              <TBody>
                {tags.map((tag) => (
                  <TR key={tag.id}>
                    <TD className="break-words font-medium">{tag.title}</TD>
                    <TD>{tag.count}</TD>
                    <TD>{tag.editorial && <Badge variant="outline">Редакционный</Badge>}</TD>
                    <TD className="w-px">
                      <TagGroupActions mediaItemId={mediaItemId} tag={tag} onRename={() => setDialogTag(tag)} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <ul className="grid gap-2 md:hidden">
            {tags.map((tag) => (
              <li key={tag.id} className="grid gap-2 rounded-lg border border-stone-200 p-3">
                <span className="break-words font-medium">{tag.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  Назначений: {tag.count}
                  {tag.editorial && <Badge variant="outline">Редакционный</Badge>}
                </span>
                <TagGroupActions mediaItemId={mediaItemId} tag={tag} onRename={() => setDialogTag(tag)} />
              </li>
            ))}
          </ul>
        </>
      ) : <EmptyState>У записи пока нет тегов.</EmptyState>}
      {dialogTag !== undefined && <TagNameDialog mediaItemId={mediaItemId} tag={dialogTag} onClose={() => setDialogTag(undefined)} />}
    </div>
  );
}
