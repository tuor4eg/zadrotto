"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import {
  createInlineFranchiseAction,
  type CreateInlineFranchiseState,
} from "../franchises/actions";
import { getFranchiseErrorMessage } from "../franchises/messages";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type InlineFranchise = {
  id: number;
  title: string;
  originalTitle: string | null;
  publicationStatus: "private" | "submitted" | "published" | "rejected";
};

type InlineFranchiseDialogProps = {
  onCreated: (franchise: InlineFranchise) => void;
};

const initialState: CreateInlineFranchiseState = {
  error: null,
  franchise: null,
};

export function InlineFranchiseDialog({ onCreated }: InlineFranchiseDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createInlineFranchiseAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const lastCreatedFranchiseIdRef = useRef<number | null>(null);
  const toastMessages = [
    ...(state.error
      ? [
          {
            id: state.error,
            tone: "error" as const,
            text: getFranchiseErrorMessage(state.error) ?? "Не удалось создать серию.",
          },
        ]
      : []),
  ] satisfies AdminToast[];

  useEffect(() => {
    if (!state.franchise || lastCreatedFranchiseIdRef.current === state.franchise.id) {
      return;
    }

    lastCreatedFranchiseIdRef.current = state.franchise.id;
    onCreated(state.franchise);
    formRef.current?.reset();
    setOpen(false);
  }, [onCreated, state.franchise]);

  const dialog = open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inline-franchise-title"
        className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="inline-franchise-title" className="text-lg font-semibold text-stone-950">
              Новая серия
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              После создания серия сразу попадёт в поле записи.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Закрыть"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>

        <form ref={formRef} action={formAction} className="mt-5 grid gap-4" noValidate>
          <AdminToasts messages={toastMessages} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="inline-franchise-title-input">Название</Label>
            <Input
              id="inline-franchise-title-input"
              name="title"
              type="text"
              required
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="inline-franchise-original-title">Оригинальное название</Label>
            <Input
              id="inline-franchise-original-title"
              name="originalTitle"
              type="text"
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="inline-franchise-description">Описание</Label>
            <Textarea
              id="inline-franchise-description"
              name="description"
              rows={4}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isPending}>
              <Plus />
              {isPending ? "Создаём" : "Создать"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Добавить серию"
        onClick={() => setOpen(true)}
      >
        <Plus />
      </Button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
