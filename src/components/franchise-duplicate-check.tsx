"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Match = { id: number; code: string; title: string; originalTitle: string | null };

export function FranchiseDuplicateCheck({
  title,
  originalTitle,
  onBlockedChange,
}: {
  title: string;
  originalTitle: string;
  onBlockedChange: (blocked: boolean) => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [exactIds, setExactIds] = useState<number[]>([]);
  const [token, setToken] = useState("");
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const key = useMemo(() => JSON.stringify({ title: title.trim(), originalTitle: originalTitle.trim() }), [title, originalTitle]);
  const canSearch = title.trim().length >= 2;
  const exactMatches = matches.filter((match) => exactIds.includes(match.id));
  const possibleMatches = matches.filter((match) => !exactIds.includes(match.id));
  const acknowledged = acknowledgedKey === key;
  const blocked = canSearch && (status === "loading" || exactMatches.length > 0 || (possibleMatches.length > 0 && !acknowledged));

  useEffect(() => onBlockedChange(blocked), [blocked, onBlockedChange]);
  useEffect(() => {
    if (!canSearch) {
      setMatches([]);
      setExactIds([]);
      setToken("");
      setAcknowledgedKey(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    setMatches([]);
    setExactIds([]);
    setToken("");
    setAcknowledgedKey(null);
    setStatus("loading");

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/franchise-duplicates", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: controller.signal });
        if (!response.ok) throw new Error("request failed");
        const result = await response.json() as { matches?: Match[]; exactMatchIds?: number[]; acknowledgementToken?: string };
        if (!isActive) return;
        setMatches(result.matches ?? []); setExactIds(result.exactMatchIds ?? []); setToken(result.acknowledgementToken ?? ""); setStatus("ready");
      } catch (error) {
        if (isActive && (error as Error).name !== "AbortError") setStatus("error");
      }
    }, 350);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [canSearch, key]);

  if (!canSearch) return null;
  return (
    <div className="grid gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
      <input type="hidden" name="franchiseDuplicateCheckToken" value={token} />
      <input type="hidden" name="franchiseDuplicateAcknowledged" value={acknowledged ? "1" : ""} />
      {status === "loading" ? <p className="text-stone-500">Проверяем уже созданные серии…</p> : null}
      {status === "error" ? <p className="text-red-700">Не удалось проверить существующие серии. Попробуйте ещё раз.</p> : null}
      {matches.length > 0 ? <><p className={exactMatches.length ? "font-medium text-red-700" : "font-medium text-amber-800"}>{exactMatches.length ? "Такая серия уже есть в архиве." : "Проверьте похожие серии в архиве."}</p><ul className="grid gap-1">{matches.map((match) => <li key={match.id}><Link href={`/franchises/${match.code}`} target="_blank" className="underline underline-offset-2">{match.title}{match.originalTitle ? ` (${match.originalTitle})` : ""}</Link></li>)}</ul></> : null}
      {possibleMatches.length > 0 ? <label className="flex gap-2 text-stone-700"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledgedKey(event.currentTarget.checked ? key : null)} />Я проверил(а): это другая серия.</label> : null}
    </div>
  );
}
