"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export function AuthorProposalsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Предложения
        <ChevronDown
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          aria-label="Предложения"
          className="archive-paper-surface absolute left-0 top-full z-[60] min-w-40 rounded-md border border-stone-300 p-1 shadow-lg"
        >
          <Link
            href="/author/media"
            onClick={() => setIsOpen(false)}
            className="block rounded-sm px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-200/60 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-950"
          >
            Записи
          </Link>
          <Link
            href="/author/series"
            onClick={() => setIsOpen(false)}
            className="block rounded-sm px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-200/60 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-950"
          >
            Серии
          </Link>
        </div>
      ) : null}
    </div>
  );
}
