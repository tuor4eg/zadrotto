"use client";

import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/common/utils";
import type { MediaType } from "@/lib/media/types";

type MediaItemDuplicateMatch = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
};

type MediaItemDuplicateCheckProps = {
  mediaType: MediaType;
  originalTitle: string;
  releaseYear: string;
  title: string;
  onBlockedChange: (blocked: boolean) => void;
};

export function MediaItemDuplicateCheck({
  mediaType,
  originalTitle,
  releaseYear,
  title,
  onBlockedChange,
}: MediaItemDuplicateCheckProps) {
  const input = useMemo(
    () => ({
      mediaType,
      originalTitle: originalTitle.trim(),
      releaseYear: releaseYear.trim(),
      title: title.trim(),
    }),
    [mediaType, originalTitle, releaseYear, title],
  );
  const key = useMemo(() => JSON.stringify(input), [input]);
  const canSearch = input.mediaType.trim().length > 0 && input.title.length >= 2;
  const [matches, setMatches] = useState<MediaItemDuplicateMatch[]>([]);
  const [exactMatchIds, setExactMatchIds] = useState<number[]>([]);
  const [acknowledgementToken, setAcknowledgementToken] = useState("");
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const isCurrent = resultKey === key && status === "ready";
  const visibleMatches = isCurrent ? matches : [];
  const visibleExactIds = useMemo(
    () => new Set(isCurrent ? exactMatchIds : []),
    [exactMatchIds, isCurrent],
  );
  const exactMatches = visibleMatches.filter((match) => visibleExactIds.has(match.id));
  const possibleMatches = visibleMatches.filter((match) => !visibleExactIds.has(match.id));
  const isLoading = canSearch && (status === "loading" || (status !== "error" && resultKey !== key));
  const acknowledged = acknowledgedKey === key;
  const blocked = canSearch && (isLoading || exactMatches.length > 0 || (possibleMatches.length > 0 && !acknowledged));

  useEffect(() => onBlockedChange(blocked), [blocked, onBlockedChange]);

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(() => {
      setStatus("loading");

      void fetch("/api/media-item-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("duplicate check failed");
          return response.json() as Promise<{
            matches?: MediaItemDuplicateMatch[];
            exactMatchIds?: number[];
            acknowledgementToken?: string;
          }>;
        })
        .then((result) => {
          if (!active) return;
          setMatches(result.matches ?? []);
          setExactMatchIds(result.exactMatchIds ?? []);
          setAcknowledgementToken(result.acknowledgementToken ?? "");
          setResultKey(key);
          setStatus("ready");
        })
        .catch(() => {
          if (!active) return;
          setMatches([]);
          setExactMatchIds([]);
          setAcknowledgementToken("");
          setResultKey("");
          setStatus("error");
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [canSearch, key]);

  if (!canSearch) return null;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="mediaDuplicateCheckToken" value={acknowledgementToken} />
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <Loader2 className="size-4 animate-spin" />
          Проверяем архив…
        </div>
      ) : null}
      {status === "error" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Не удалось проверить архив. При сохранении проверим еще раз.
        </p>
      ) : null}
      {visibleMatches.length > 0 ? (
        <div className={cn("rounded-md border p-3", exactMatches.length ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50")}>
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
            <AlertTriangle className="size-5" />
            Похоже, это уже есть в архиве
          </div>
          <div className="mt-3 grid gap-2">
            {visibleMatches.map((match) => {
              const exact = visibleExactIds.has(match.id);
              return (
                <div key={match.id} className="grid gap-2 rounded-md border border-white/70 bg-white/80 p-2 text-stone-950 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold">{match.title}</span>
                    <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", exact ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                      {exact ? "точное совпадение" : "похоже"}
                    </span>
                    <div className="mt-1 text-xs text-stone-500">{[match.originalTitle, match.releaseYear].filter(Boolean).join(" · ")}</div>
                  </div>
                  <Link href={`/media/${match.code}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Открыть запись
                  </Link>
                </div>
              );
            })}
          </div>
          {exactMatches.length > 0 ? (
            <p className="mt-3 text-xs font-medium text-red-800">Создание заблокировано: совпали тип медиа, название и год.</p>
          ) : (
            <label className="mt-3 flex items-start gap-2 text-xs font-medium text-stone-800">
              <input type="checkbox" name="mediaDuplicateAcknowledged" value="1" checked={acknowledged} onChange={(event) => setAcknowledgedKey(event.currentTarget.checked ? key : null)} className="mt-0.5 size-4 rounded border-stone-300" />
              Я проверил похожие записи и создаю другую запись.
            </label>
          )}
        </div>
      ) : null}
    </div>
  );
}
