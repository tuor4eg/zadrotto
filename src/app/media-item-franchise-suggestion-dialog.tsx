"use client";

import { Check, Plus, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { FranchiseDuplicateCheck } from "@/components/franchise-duplicate-check";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { Input, Label, Textarea } from "@/components/ui/form";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";
import {
  submitAuthorMediaItemFranchiseSuggestionAction,
  type MediaItemFranchiseSuggestionState,
} from "@/app/media/franchise-actions";

const initialState: MediaItemFranchiseSuggestionState = { error: null, success: false };

export function MediaItemFranchiseSuggestionDialog({
  canPublishWithoutReview,
  franchises,
  mediaItemCode,
  mediaItemId,
}: {
  canPublishWithoutReview: boolean;
  franchises: SearchableFranchiseOption[];
  mediaItemCode: string;
  mediaItemId: number;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedFranchiseIds, setSelectedFranchiseIds] = useState<string[]>([]);
  const [franchiseSelectResetKey, setFranchiseSelectResetKey] = useState(0);
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function resetAndCloseDialog() {
    formRef.current?.reset();
    setMode("existing");
    setSelectedFranchiseIds([]);
    setTitle("");
    setOriginalTitle("");
    setFranchiseSelectResetKey((currentKey) => currentKey + 1);
    setOpen(false);
  }

  async function submitSuggestion(
    previousState: MediaItemFranchiseSuggestionState,
    formData: FormData,
  ) {
    const nextState = await submitAuthorMediaItemFranchiseSuggestionAction(
      previousState,
      formData,
    );

    if (nextState.success) {
      resetAndCloseDialog();
    }

    return nextState;
  }

  const [state, formAction, isPending] = useActionState(submitSuggestion, initialState);
  const label = canPublishWithoutReview ? "Добавить серию" : "Предложить серию";

  function closeDialog() {
    resetAndCloseDialog();
  }

  const errorMessage = state.error === "duplicate"
    ? "Одна или несколько выбранных серий уже предложены для этой записи и ожидают проверки."
    : state.error === "duplicate-franchise-exact"
      ? "Такая серия уже есть в архиве. Открой существующую вместо создания дубля."
      : state.error === "duplicate-franchise-possible"
        ? "Проверь похожие серии в архиве и подтверди, что создаешь другую серию."
    : state.error === "unavailable"
      ? "Не удалось добавить серию. Попробуйте ещё раз."
      : state.error === "invalid"
        ? "Заполните обязательные поля."
        : null;

  return (
    <>
      <ArchiveTooltip label={label} side="bottom">
        <Button type="button" variant="outline" size="icon" aria-label={label} onClick={() => setOpen(true)}>
          <Plus />
        </Button>
      </ArchiveTooltip>
      {open ? createPortal(
        <div
          aria-labelledby="media-franchise-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/45 p-4"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isPending) closeDialog();
          }}
        >
          <div className="archive-paper archive-panel min-h-[500px] w-full max-w-xl p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="media-franchise-dialog-title" className="font-serif text-3xl leading-none text-stone-950">{label}</h2>
                <p className="mt-2 font-mono text-sm uppercase tracking-[0.14em] text-stone-600">{canPublishWithoutReview ? "Связь появится в карточке сразу." : "После одобрения серия появится в карточке."}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ArchiveTooltip label={label} side="bottom">
                  <button
                    type="submit"
                    form="media-franchise-suggestion-form"
                    disabled={isPending || (mode === "new" && duplicateBlocked)}
                    className="grid size-9 place-items-center rounded-md border border-emerald-950/20 bg-emerald-50/80 text-emerald-950 transition-colors hover:border-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={label}
                  >
                    <Check className="size-4" />
                  </button>
                </ArchiveTooltip>
                <ArchiveTooltip label="Закрыть" side="bottom">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={closeDialog}
                    className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Закрыть окно выбора серии"
                  >
                    <X className="size-4" />
                  </button>
                </ArchiveTooltip>
              </div>
            </div>
            <form id="media-franchise-suggestion-form" ref={formRef} action={formAction} className="mt-5 grid gap-4" noValidate>
              <input type="hidden" name="mediaItemId" value={mediaItemId} />
              <input type="hidden" name="mediaItemCode" value={mediaItemCode} />
              <input type="hidden" name="mode" value={mode} />
              <div className="flex rounded-md border border-stone-200 p-1">
                <Button type="button" variant={mode === "existing" ? "default" : "ghost"} size="sm" className={mode === "existing" ? "flex-1" : "flex-1 bg-white hover:bg-stone-50"} onClick={() => setMode("existing")}>Выбрать существующую</Button>
                <Button type="button" variant={mode === "new" ? "default" : "ghost"} size="sm" className={mode === "new" ? "flex-1" : "flex-1 bg-white hover:bg-stone-50"} onClick={() => setMode("new")}>Создать новую</Button>
              </div>
              {mode === "existing" ? <div className="grid gap-2"><Label htmlFor="media-franchise-ids">Серии</Label><SearchableFranchiseMultiSelect key={franchiseSelectResetKey} id="media-franchise-ids" name="franchiseIds" options={franchises} value={selectedFranchiseIds} onChange={setSelectedFranchiseIds} /></div> : <>
                <div className="grid gap-2"><Label htmlFor="media-new-franchise-title">Название</Label><Input id="media-new-franchise-title" name="title" required disabled={isPending} autoFocus value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></div>
                <div className="grid gap-2"><Label htmlFor="media-new-franchise-original-title">Оригинальное название</Label><Input id="media-new-franchise-original-title" name="originalTitle" disabled={isPending} value={originalTitle} onChange={(event) => setOriginalTitle(event.currentTarget.value)} /></div>
                <FranchiseDuplicateCheck title={title} originalTitle={originalTitle} onBlockedChange={setDuplicateBlocked} />
                <div className="grid gap-2"><Label htmlFor="media-new-franchise-description">Описание</Label><Textarea id="media-new-franchise-description" name="description" rows={4} disabled={isPending} /></div>
              </>}
              {errorMessage ? <p className="text-sm text-red-700" role="alert">{errorMessage}</p> : null}
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
