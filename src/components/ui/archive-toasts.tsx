"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type ArchiveToast = {
  id: string;
  text: string;
  tone: "success" | "error";
};

type ArchiveToastsProps = {
  clearParams?: string[];
  messages: ArchiveToast[];
};

const TOAST_DURATION_MS = 5200;

export function ArchiveToasts({ clearParams = [], messages }: ArchiveToastsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visibleMessages, setVisibleMessages] = useState(messages);
  const messageSignature = useMemo(
    () => messages.map((message) => `${message.id}:${message.text}`).join("|"),
    [messages],
  );

  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = window.setTimeout(() => setVisibleMessages(messages), 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [messageSignature, messages]);

  useEffect(() => {
    if (messages.length === 0 || clearParams.length === 0) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    let changed = false;

    clearParams.forEach((param) => {
      if (nextSearchParams.has(param)) {
        nextSearchParams.delete(param);
        changed = true;
      }
    });

    if (!changed) {
      return;
    }

    const queryString = nextSearchParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [clearParams, messages.length, pathname, router, searchParams]);

  useEffect(() => {
    if (visibleMessages.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisibleMessages([]);
    }, TOAST_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [visibleMessages.length]);

  if (visibleMessages.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[90] grid w-[min(24rem,calc(100vw-2rem))] gap-2">
      {visibleMessages.map((message) => {
        const isSuccess = message.tone === "success";
        const Icon = isSuccess ? CheckCircle2 : AlertTriangle;

        return (
          <div
            key={message.id}
            className={cn(
              "archive-paper-surface grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border px-3.5 py-3 text-sm shadow-[0_18px_34px_rgba(28,25,23,0.22)]",
              isSuccess
                ? "border-emerald-700/35 text-stone-950"
                : "border-red-800/35 text-stone-950",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-7 place-items-center rounded-full border bg-white/70",
                isSuccess
                  ? "border-emerald-700/30 text-emerald-800"
                  : "border-red-800/30 text-red-800",
              )}
            >
              <Icon className="size-4" />
            </span>
            <p className="min-w-0 pt-1 leading-5 text-stone-800">{message.text}</p>
            <button
              type="button"
              className="grid size-7 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-950"
              aria-label="Закрыть сообщение"
              onClick={() =>
                setVisibleMessages((currentMessages) =>
                  currentMessages.filter((currentMessage) => currentMessage.id !== message.id),
                )
              }
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
