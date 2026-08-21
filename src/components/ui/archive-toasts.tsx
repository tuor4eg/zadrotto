"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/common/utils";
import { useToastSettings } from "@/components/ui/toast-settings-provider";

export type ArchiveToast = {
  id: string;
  imageUrl?: string | null;
  link?: {
    href: string;
    label: string;
    onClick?: () => void;
  };
  text: string;
  tone: "success" | "error";
};

type ArchiveToastsProps = {
  clearParams?: string[];
  messages: ArchiveToast[];
};

export function ArchiveToasts({ clearParams = [], messages }: ArchiveToastsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminDurationSeconds, siteDurationSeconds } = useToastSettings();
  const durationSeconds = pathname === "/admin" || pathname.startsWith("/admin/")
    ? adminDurationSeconds
    : siteDurationSeconds;
  const [visibleMessages, setVisibleMessages] = useState(messages);
  const messageSignature = useMemo(
    () =>
      messages
        .map(
          (message) =>
            `${message.id}:${message.link?.href ?? ""}:${message.link?.label ?? ""}:${message.text}:${message.imageUrl ?? ""}`,
        )
        .join("|"),
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
    }, durationSeconds * 1000);

    return () => window.clearTimeout(timeoutId);
  }, [durationSeconds, visibleMessages.length]);

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
            {message.imageUrl ? (
              <span className="relative mt-0.5 size-10 overflow-hidden rounded-sm border border-stone-300/80 bg-white/70">
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="40px"
                  src={message.imageUrl}
                  unoptimized
                />
              </span>
            ) : (
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
            )}
            <p className="min-w-0 pt-1 leading-5 text-stone-800">
              {message.link ? (
                <>
                  <Link
                    className="font-medium text-stone-950 underline decoration-stone-400 underline-offset-2 transition-colors hover:text-red-800"
                    href={message.link.href}
                    onClick={message.link.onClick}
                  >
                    {message.link.label}
                  </Link>{" "}
                </>
              ) : null}
              {message.text}
            </p>
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
