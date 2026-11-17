"use client";

import { SearchInput } from "@/components/ui/search-input";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";
import { QUIZ_MECHANICS, type QuizType } from "@/lib/quizzes/mechanics";

export function QuizFilters({ searchQuery, state, hasCorrect, type, stateOptions }: {
  searchQuery: string;
  state?: string;
  hasCorrect?: string;
  type?: QuizType;
  stateOptions: { value: string; label: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function applyFilters(query: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    for (const name of ["state", "type", "hasCorrect"]) {
      const value = formRef.current?.querySelector<HTMLSelectElement>(`[name="${name}"]`)?.value;
      if (value) params.set(name, value);
    }
    const suffix = params.toString();
    startTransition(() => router.replace(suffix ? `/admin/quizzes?${suffix}` : "/admin/quizzes", { scroll: false }));
  }
  const { draft, setDraft, resetDraft } = useDebouncedSearchDraft({ searchQuery, onSearch: applyFilters });
  const selectClass = "h-10 rounded-md border border-stone-300 bg-white px-3";
  return <form ref={formRef} aria-busy={pending} className="flex flex-wrap items-end gap-3"
    onSubmit={(event) => { event.preventDefault(); applyFilters(draft); }}>
    <label className="grid min-w-0 flex-1 basis-64 gap-1 text-sm">
      <span className="font-medium">Вопрос или ответ</span>
      <SearchInput bare className={selectClass} value={draft} onChange={(event) => { setDraft(event.target.value); if (!event.target.value) applyFilters(""); }} name="q" placeholder="Начните вводить текст" />
    </label>
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Состояние</span>
      <select key={`state-${state}`} className={selectClass} defaultValue={state ?? ""} name="state" onChange={() => applyFilters(draft)}>
        <option value="">Все</option>
        {stateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Тип квиза</span>
      <select key={`type-${type}`} className={selectClass} defaultValue={type ?? ""} name="type" onChange={() => applyFilters(draft)}>
        <option value="">Все</option>
        {Object.entries(QUIZ_MECHANICS).map(([value, mechanic]) => <option key={value} value={value}>{mechanic.label}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Ответили правильно</span>
      <select key={`correct-${hasCorrect}`} className={selectClass} defaultValue={hasCorrect ?? ""} name="hasCorrect" onChange={() => applyFilters(draft)}>
        <option value="">Неважно</option><option value="yes">Есть</option><option value="no">Нет</option>
      </select>
    </label>
    {(draft || state || type || hasCorrect) ? <button type="button" className={buttonVariants({ variant: "ghost" })} onClick={() => {
      resetDraft();
      formRef.current?.querySelectorAll("select").forEach((select) => { select.value = ""; });
      applyFilters("");
    }}>Сбросить</button> : null}
  </form>;
}
