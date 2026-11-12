"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/form";

type Series = { id: number; title: string; originalTitle: string | null };
export function TierSeriesSelect({ id, value, onChange, variant = "admin" }: { id: string; value: string; onChange: (value: string) => void; variant?: "admin" | "archive" }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Series[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/tier-lists/series?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Поиск серий временно недоступен.");
        const items: Series[] = await response.json();
        if (!controller.signal.aborted) setResults(items);
      } catch (cause) {
        if (!controller.signal.aborted) { setResults([]); setError(cause instanceof Error ? cause.message : "Не удалось найти серии."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  function select(item: Series) { onChange(String(item.id)); setQuery(item.title); setOpen(false); }
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])
  const archive = variant === "archive"
  return <div className="relative z-20" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Input id={id} role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open} className={archive ? "h-10 border-stone-300/80 bg-stone-50/70 font-mono text-sm placeholder:text-stone-400 focus:border-stone-950" : undefined} placeholder="Найти серию (от 2 символов)" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setResults([]); setError(""); setLoading(false); onChange(""); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter" && open && results[0]) { event.preventDefault(); select(results[0]); } }} />
    {open ? <div id={listId} role="listbox" className={archive ? "archive-paper-surface archive-scrollbar absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-stone-500/70 p-1 shadow-[0_14px_26px_rgba(28,25,23,0.24)]" : "absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded border bg-white p-1 shadow-lg"}>
      <button type="button" role="option" aria-selected={!value} className="w-full p-2 text-left text-sm hover:bg-stone-100" onClick={() => { onChange(""); setQuery(""); setResults([]); setOpen(false); }}>Все серии</button>
      {loading ? <p role="status" className="p-2 text-sm">Ищем серии…</p> : error ? <p role="status" className="p-2 text-sm">{error}</p> : results.map((item) => <button type="button" role="option" aria-selected={String(item.id) === value} key={item.id} className="block w-full p-2 text-left text-sm hover:bg-stone-100" onClick={() => select(item)}>{item.title}{item.originalTitle ? <span className="block text-xs text-stone-500">{item.originalTitle}</span> : null}</button>)}
      {!loading && !error && !results.length ? <p className="p-2 text-sm text-stone-500">{query.trim().length < 2 ? "Введите хотя бы 2 символа." : "Серии не найдены."}</p> : null}
    </div> : null}
  </div>;
}
