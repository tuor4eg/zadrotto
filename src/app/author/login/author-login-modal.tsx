"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { AuthorLoginForm } from "./author-login-form";

type AuthorLoginModalProps = { onClose: () => void; onSuccess: () => void };

export function AuthorLoginModal({ onClose, onSuccess }: AuthorLoginModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );

      if (!focusableElements?.length) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElementRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="archive-paper archive-panel w-full max-w-sm p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="author-login-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-900">
              Автор
            </p>
            <h2 id="author-login-title" className="mt-2 font-serif text-3xl leading-none">
              Вход
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60"
            aria-label="Закрыть окно входа"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5">
          <AuthorLoginForm onSuccess={onSuccess} />
        </div>
      </div>
    </div>
  );
}
