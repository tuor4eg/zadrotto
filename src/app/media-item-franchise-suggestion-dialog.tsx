"use client";

import { Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { FranchiseDuplicateCheck } from "@/components/franchise-duplicate-check";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { FranchiseSuggestionStatus } from "@/components/ui/franchise-suggestion-status";
import { Input, Label, Textarea } from "@/components/ui/form";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import {
  SearchableFranchiseSelect,
  type SearchableFranchiseOption,
} from "@/components/ui/searchable-franchise-select";
import {
  submitAuthorMediaItemFranchiseSuggestionAction,
  type MediaItemFranchiseSuggestionState,
} from "@/app/media/franchise-actions";
import {
  appendUniqueFranchiseIds,
  requestFranchiseSuggestions,
  resolveSuggestedFranchises,
} from "@/lib/ai/scenarios/suggest-franchises-client";
import type { SuggestFranchisesMediaInput } from "@/lib/ai/scenarios/suggest-franchises";

const initialState: MediaItemFranchiseSuggestionState = { error: null, success: false };

export function MediaItemFranchiseSuggestionDialog({
  assignedFranchises,
  canPublishWithoutReview,
  canSuggestFranchises,
  franchises,
  franchiseSuggestionInput,
  mediaItemCode,
  mediaItemId,
  triggerTooltipSide = "bottom",
  triggerTooltipPortal = false,
}: {
  assignedFranchises: Array<{
    id: number;
    code: string;
    path?: Array<{ id: number; title: string }>;
    removalRequested?: boolean;
    title: string;
  }>;
  canPublishWithoutReview: boolean;
  canSuggestFranchises: boolean;
  franchises: SearchableFranchiseOption[];
  franchiseSuggestionInput: Omit<SuggestFranchisesMediaInput, "selectedFranchiseIds">;
  mediaItemCode: string;
  mediaItemId: number;
  triggerTooltipSide?: "bottom" | "left" | "right" | "top";
  triggerTooltipPortal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedFranchiseIds, setSelectedFranchiseIds] = useState<string[]>([]);
  const [franchiseSelectResetKey, setFranchiseSelectResetKey] = useState(0);
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const [franchiseRemovalIds, setFranchiseRemovalIds] = useState<string[]>([]);
  const [removalConfirmationOpen, setRemovalConfirmationOpen] = useState(false);
  const [isSuggestingFranchises, setIsSuggestingFranchises] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const removalConfirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  function resetAndCloseDialog() {
    formRef.current?.reset();
    setMode("existing");
    setSelectedFranchiseIds([]);
    setFranchiseRemovalIds([]);
    setRemovalConfirmationOpen(false);
    removalConfirmedRef.current = false;
    setTitle("");
    setOriginalTitle("");
    setParentId("");
    setAiMessage(null);
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
  const label = canPublishWithoutReview ? "Изменить серии" : "Предложить изменения";

  function closeDialog() {
    resetAndCloseDialog();
  }

  function submitAfterRemovalConfirmation() {
    removalConfirmedRef.current = true;
    setRemovalConfirmationOpen(false);
    formRef.current?.requestSubmit();
  }

  async function suggestFranchises() {
    if (isSuggestingFranchises) return;

    setIsSuggestingFranchises(true);
    setAiMessage(null);

    try {
      const excludedIds = [
        ...assignedFranchises.map((franchise) => String(franchise.id)),
        ...selectedFranchiseIds,
      ];
      const franchiseIds = await requestFranchiseSuggestions({
        ...franchiseSuggestionInput,
        selectedFranchiseIds: excludedIds.map(Number),
      });
      const suggested = resolveSuggestedFranchises(franchises, excludedIds, franchiseIds);

      if (suggested.length === 0) {
        setAiMessage({ tone: "success", text: "Подходящих серий не найдено." });
        return;
      }

      setSelectedFranchiseIds((current) =>
        appendUniqueFranchiseIds(current, suggested.map((franchise) => franchise.id)),
      );
      setFranchiseSelectResetKey((currentKey) => currentKey + 1);
      setAiMessage({
        tone: "success",
        text: `Добавлены серии: ${suggested.map((franchise) => franchise.title).join(", ")}.`,
      });
    } catch {
      setAiMessage({
        tone: "error",
        text: "Не удалось подобрать серии. Попробуйте ещё раз.",
      });
    } finally {
      setIsSuggestingFranchises(false);
    }
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
      <ArchiveTooltip label={label} portal={triggerTooltipPortal} side={triggerTooltipSide}>
        <Button type="button" size="icon" className="size-7 rounded-full bg-[var(--archive-bg-end)] hover:bg-[var(--archive-bg-start)]" aria-label={label} onClick={() => setOpen(true)}>
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
          <div className="archive-paper archive-panel relative min-h-[500px] w-full max-w-xl p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="media-franchise-dialog-title" className="font-serif text-3xl leading-none text-stone-950">{label}</h2>
                <p className="mt-2 font-mono text-sm uppercase tracking-[0.14em] text-stone-600">{canPublishWithoutReview ? "Серии в карточке будут изменены." : "Серии в карточке будут изменены после одобрения."}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ArchiveTooltip label={label} side="bottom">
                  <button
                    type="submit"
                    form="media-franchise-suggestion-form"
                    disabled={isPending || (mode === "new" && duplicateBlocked) || (mode === "existing" && selectedFranchiseIds.length === 0 && franchiseRemovalIds.length === 0)}
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
            <form
              id="media-franchise-suggestion-form"
              ref={formRef}
              action={formAction}
              className="mt-5 grid gap-4"
              noValidate
              onSubmit={(event) => {
                if (franchiseRemovalIds.length > 0 && !removalConfirmedRef.current) {
                  event.preventDefault();
                  setRemovalConfirmationOpen(true);
                }
              }}
            >
              <input type="hidden" name="mediaItemId" value={mediaItemId} />
              <input type="hidden" name="mediaItemCode" value={mediaItemCode} />
              <input type="hidden" name="mode" value={mode} />
              {franchiseRemovalIds.map((id) => <input key={id} type="hidden" name="franchiseRemovalIds" value={id} />)}
              <div className="flex rounded-md border border-stone-200 p-1">
                <Button type="button" variant={mode === "existing" ? "default" : "ghost"} size="sm" className={mode === "existing" ? "flex-1" : "flex-1 bg-white hover:bg-stone-50"} onClick={() => setMode("existing")}>Выбрать существующую</Button>
                <Button type="button" variant={mode === "new" ? "default" : "ghost"} size="sm" className={mode === "new" ? "flex-1" : "flex-1 bg-white hover:bg-stone-50"} onClick={() => setMode("new")}>Создать новую</Button>
              </div>
              {mode === "existing" ? <div className="grid gap-2"><Label htmlFor="media-franchise-ids">Серии</Label><div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><SearchableFranchiseMultiSelect key={franchiseSelectResetKey} id="media-franchise-ids" name="franchiseIds" options={franchises} value={selectedFranchiseIds} onChange={setSelectedFranchiseIds} /></div>{canSuggestFranchises ? <ArchiveTooltip label="Предложить серии" side="left"><Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Предложить серии" disabled={isPending || isSuggestingFranchises} onClick={() => void suggestFranchises()}><Sparkles className={isSuggestingFranchises ? "animate-pulse" : undefined} /></Button></ArchiveTooltip> : null}</div><FranchiseSuggestionStatus visible={isSuggestingFranchises} />
                {aiMessage ? <p className={`text-xs leading-5 ${aiMessage.tone === "error" ? "text-red-700" : "text-stone-600"}`} role={aiMessage.tone === "error" ? "alert" : "status"}>{aiMessage.text}</p> : null}
                {assignedFranchises.length > 0 ? (
                  <div className="mt-1 grid gap-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">Уже назначены</p>
                    <div className="flex flex-wrap gap-1.5">
                      {assignedFranchises.map((franchise) => (
                        <span key={franchise.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700">
                          <span className="truncate">{franchise.path?.map((part) => part.title).join(" / ") ?? franchise.title}</span>
                          {franchise.removalRequested ? <span className="text-stone-500">(на удалении)</span> : franchiseRemovalIds.includes(String(franchise.id)) ? <><span className="text-stone-500">(будет удалена)</span><button type="button" onClick={() => setFranchiseRemovalIds((ids) => ids.filter((id) => id !== String(franchise.id)))} className="text-stone-500 underline" aria-label={`Отменить удаление серии ${franchise.title}`}>отменить</button></> : <button type="button" onClick={() => setFranchiseRemovalIds((ids) => [...ids, String(franchise.id)])} aria-label={`Пометить серию ${franchise.title} к удалению`}><Trash2 className="size-3.5" /></button>}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div> : <>
                <div className="grid gap-2"><Label htmlFor="media-new-franchise-title">Название</Label><Input id="media-new-franchise-title" name="title" required disabled={isPending} autoFocus value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></div>
                <div className="grid gap-2"><Label htmlFor="media-new-franchise-original-title">Оригинальное название</Label><Input id="media-new-franchise-original-title" name="originalTitle" disabled={isPending} value={originalTitle} onChange={(event) => setOriginalTitle(event.currentTarget.value)} /></div>
                <FranchiseDuplicateCheck title={title} originalTitle={originalTitle} onBlockedChange={setDuplicateBlocked} />
                <div className="grid gap-2">
                  <Label htmlFor="media-new-franchise-parent">Родительская серия</Label>
                  <SearchableFranchiseSelect
                    id="media-new-franchise-parent"
                    name="parentId"
                    options={franchises.map((franchise) => ({
                      ...franchise,
                      disabled: false,
                      disabledLabel: undefined,
                    }))}
                    value={parentId}
                    onChange={setParentId}
                  />
                  <p className="text-xs leading-5 text-stone-500">Без выбранного родителя серия будет корневой.</p>
                </div>
                <div className="grid gap-2"><Label htmlFor="media-new-franchise-description">Описание</Label><Textarea id="media-new-franchise-description" name="description" rows={4} disabled={isPending} /></div>
              </>}
              {errorMessage ? <p className="text-sm text-red-700" role="alert">{errorMessage}</p> : null}
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
      {open && removalConfirmationOpen ? createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-center bg-stone-950/55 p-5">
          <div className="archive-paper archive-panel w-full max-w-md p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="media-franchise-removal-confirmation-title">
            <h3 id="media-franchise-removal-confirmation-title" className="font-serif text-2xl leading-none text-stone-950">Подтвердить удаление серий?</h3>
            <p className="mt-3 text-sm leading-6 text-stone-700">Изменения будут применены после сохранения. Для серий, требующих проверки, будет создана заявка на удаление.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRemovalConfirmationOpen(false)}>Вернуться</Button>
              <Button type="button" onClick={submitAfterRemovalConfirmation}>Сохранить изменения</Button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
