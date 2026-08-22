"use client";

import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type { BugReportEntityContext } from "@/components/external-interface/external-interface-layer";

export function BugReportModal({
  entityContext,
  onClose,
}: {
  entityContext: BugReportEntityContext | null;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);

  function setSubmissionPending(value: boolean) {
    pendingRef.current = value;
    setPending(value);
  }

  function closeIfIdle() {
    if (!pendingRef.current) onClose();
  }

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus();
    };
  }, [onClose]);

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDescription = description.trim();
    if (!normalizedDescription) {
      setError("Опиши, что пошло не так.");
      return;
    }

    setSubmissionPending(true);
    setError(null);
    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: normalizedDescription,
          entityId: entityContext?.entityId ?? null,
          entityType: entityContext?.entityType ?? null,
          url: window.location.href,
          clientContext: {
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не удалось отправить сообщение. Попробуй ещё раз.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Не удалось отправить сообщение. Попробуй ещё раз.");
    } finally {
      setSubmissionPending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-stone-950/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeIfIdle();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        tabIndex={-1}
        className="archive-paper archive-panel relative w-full max-w-lg p-6 shadow-2xl sm:p-8"
      >
        <button
          type="button"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-950/5 hover:text-stone-700"
          style={{ position: "absolute" }}
          aria-label="Закрыть сообщение об ошибке"
          disabled={pending}
          onClick={closeIfIdle}
        >
          <X className="size-4" />
        </button>

        {submitted ? (
          <div className="grid justify-items-center gap-4 py-5 text-center">
            <Image
              src="/mascot/deadz_bugreport.png"
              alt=""
              width={240}
              height={300}
              className="max-h-[300px] w-auto object-contain"
            />
            <CheckCircle2 className="size-8 text-emerald-700" aria-hidden="true" />
            <h2 id="bug-report-title" className="font-serif text-3xl">Сообщение отправлено</h2>
            <p className="max-w-sm text-sm leading-6 text-stone-600">
              Спасибо! Ошибка уже отправилась в редакционную лабораторию.
            </p>
            <Button onClick={onClose}>Готово</Button>
          </div>
        ) : (
          <form className="grid gap-5" onSubmit={submitReport}>
            <div className="pr-10">
              <h2 id="bug-report-title" className="font-serif text-3xl">Сообщить об ошибке</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Коротко опиши проблему. Страницу и технический контекст мы приложим сами.
              </p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="bug-report-description" className="text-sm font-medium">
                Что пошло не так?
              </label>
              <textarea
                id="bug-report-description"
                className="min-h-36 resize-y rounded-md border border-stone-300 bg-white/70 p-3 text-sm leading-6 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-900/10"
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                autoFocus
                required
              />
              <div className="flex justify-between gap-3 text-xs text-stone-500">
                <span>Без технических анкет и шаманства.</span>
                <span>{description.length}/2000</span>
              </div>
            </div>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Отмена</Button>
              <Button type="submit" disabled={pending || !description.trim()}>
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                {pending ? "Отправляем…" : "Отправить"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
