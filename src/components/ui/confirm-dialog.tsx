"use client";

import { X } from "lucide-react";
import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

import { Button } from "./button";

type ConfirmDialogProps = {
  cancelLabel?: string;
  children: React.ReactNode;
  description: string;
  onClose: () => void;
  title: string;
  variant?: "default" | "archive";
};

export function ConfirmDialog({
  cancelLabel = "Отмена",
  children,
  description,
  onClose,
  title,
  variant = "default",
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const archive = variant === "archive";

  return createPortal(
    <div className={`fixed inset-0 grid place-items-center px-4 py-6 ${archive ? "z-[120] bg-stone-950/55" : "z-50 bg-stone-950/45"}`}>
      <button
        aria-label="Закрыть подтверждение"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={archive
          ? "archive-paper archive-panel media-carrier-font-pc-steam relative w-full max-w-md p-5 text-stone-950 shadow-2xl [&_*]:[font-family:inherit]"
          : "relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={archive ? "text-2xl leading-none text-stone-950" : "text-lg font-semibold tracking-tight"} id={titleId}>{title}</h2>
            <p className={archive ? "mt-3 text-sm leading-6 text-stone-700" : "mt-2 text-sm leading-6 text-stone-600"} id={descriptionId}>{description}</p>
          </div>
          {archive ? (
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          ) : (
            <Button aria-label="Закрыть" className="shrink-0" onClick={onClose} size="icon" variant="ghost">
              <X />
            </Button>
          )}
        </div>
        <div className={`flex flex-wrap justify-end gap-2 ${archive ? "mt-5" : ""}`}>
          <Button onClick={onClose} type="button" variant="outline">{cancelLabel}</Button>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
