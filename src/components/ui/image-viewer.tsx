"use client";

import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type ImageViewerProps = {
  alt: string;
  children: React.ReactNode;
  src: string;
  title?: string;
  triggerClassName?: string;
};

export function ImageViewer({
  alt,
  children,
  src,
  title,
  triggerClassName,
}: ImageViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={`border-0 bg-transparent p-0 ${triggerClassName ?? ""}`}
        onClick={() => setIsOpen(true)}
      >
        {children}
      </button>

      {isOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/88 p-4 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            >
              {title ? (
                <h2 id={titleId} className="sr-only">
                  {title}
                </h2>
              ) : null}
              <button
                type="button"
                aria-label="Закрыть"
                className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-stone-200/30 bg-stone-950/70 text-stone-50 shadow-lg transition-colors hover:border-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-50"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsOpen(false);
                }}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="max-h-[92vh] max-w-[94vw] object-contain shadow-2xl shadow-stone-950"
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
