"use client";

import { X } from "lucide-react";
import { useEffect, useId } from "react";

import { Button } from "./button";

type ConfirmDialogProps = {
  cancelLabel?: string;
  children: React.ReactNode;
  description: string;
  onClose: () => void;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = "Отмена",
  children,
  description,
  onClose,
  title,
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
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
        className="relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight" id={titleId}>{title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600" id={descriptionId}>{description}</p>
          </div>
          <Button aria-label="Закрыть" className="shrink-0" onClick={onClose} size="icon" variant="ghost">
            <X />
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">{cancelLabel}</Button>
          {children}
        </div>
      </div>
    </div>
  );
}
