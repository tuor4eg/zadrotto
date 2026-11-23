"use client";

import { Pencil, Search, Unlink } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";

import { MediaBrowserDialog } from "@/components/admin/media-browser-dialog";
import type { AdminMediaBrowserSeriesOption } from "@/lib/admin/media-browser";
import type { MediaTypeOption } from "@/lib/media/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  ENTRY_SOURCE_LABELS, entrySourceKey, isEntrySourceType, type EntrySourceOption, type EntrySourceSearchOption, type EntrySourceType,
} from "@/lib/media/entry-sources";
import { normalizeSearchText } from "@/lib/search/normalize";

import { saveEntrySourcesAction, saveWorksBasedOnAction, type EntrySourcesActionState } from "./entry-source-actions";

type EntrySourceEditorProps = {
  entryId: number;
  initialSources: EntrySourceOption[];
  creatorRoles: Record<number, string[]>;
  mediaTypes: MediaTypeOption[];
  series: AdminMediaBrowserSeriesOption[];
};

const SOURCE_TABS = [
  { id: "sources", label: "Основано на" },
  { id: "works", label: "Основа для" },
] as const;

export function EntrySourcesForm({ initialSources, initialWorks, ...props }: EntrySourceEditorProps & {
  initialWorks: EntrySourceOption[];
}) {
  const [activeTab, setActiveTab] = useState<"sources" | "works">("sources");
  const tabsId = useId();

  return (
    <section className="grid gap-3" aria-labelledby={`${tabsId}-heading`}>
      <h2 id={`${tabsId}-heading`} className="text-lg font-semibold">Первоисточники</h2>
      <div className="flex gap-2 border-b border-stone-200 pb-3" role="tablist" aria-labelledby={`${tabsId}-heading`}>
        {SOURCE_TABS.map(({ id, label }) => (
          <Button
            key={id}
            id={`${tabsId}-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`${tabsId}-${id}-panel`}
            tabIndex={activeTab === id ? 0 : -1}
            size="sm"
            variant={activeTab === id ? "default" : "ghost"}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "sources"
                : event.key === "End" ? "works"
                  : id === "sources" ? "works" : "sources";
              setActiveTab(next);
              document.getElementById(`${tabsId}-${next}`)?.focus();
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {SOURCE_TABS.map(({ id }) => (
        <div
          key={id}
          id={`${tabsId}-${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${id}`}
          hidden={activeTab !== id}
        >
          <EntrySourceEditor {...props} initialSources={id === "works" ? initialWorks : initialSources} reverse={id === "works"} />
        </div>
      ))}
    </section>
  );
}

const SOURCE_EDITOR_PATHS = {
  entry: "/admin/media",
  creator: "/admin/creators",
  series: "/admin/series",
} satisfies Record<EntrySourceType, string>;

function SourceRowTitle({ source }: { source: EntrySourceOption }) {
  const details = [source.mediaTypeName, source.releaseYear].filter((value) => value != null).join(" · ");

  return (
    <div className="min-w-0 break-words">
      <div className="font-medium">{source.label}</div>
      {details && <div className="text-xs text-stone-500">{details}</div>}
    </div>
  );
}

function SourceRowActions({ source, onRemove }: { source: EntrySourceOption; onRemove: () => void }) {
  return (
    <div className="flex gap-2">
      <Link
        href={`${SOURCE_EDITOR_PATHS[source.type]}/${source.id}/edit`}
        prefetch={false}
        aria-label={`Редактировать «${source.label}»`}
        title="Редактировать"
        className={buttonVariants({ variant: "outline", size: "icon" })}
      >
        <Pencil aria-hidden className="size-4" />
      </Link>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Разорвать связь с «${source.label}»`}
        title="Разорвать связь"
        onClick={onRemove}
      >
        <Unlink aria-hidden className="size-4" />
      </Button>
    </div>
  );
}

function EntrySourceEditor({ entryId, initialSources, creatorRoles, mediaTypes, series, reverse }: EntrySourceEditorProps & {
  reverse: boolean;
}) {
  const [sources, setSources] = useState(initialSources);
  const [type, setType] = useState<EntrySourceType>("entry");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const [result, setResult] = useState<{ key: string; items: EntrySourceSearchOption[]; error?: boolean }>();
  const save = reverse ? saveWorksBasedOnAction : saveEntrySourcesAction;
  const [state, action, pending] = useActionState<EntrySourcesActionState, FormData>(save.bind(null, entryId), {
    message: "",
    savedWorks: reverse ? initialSources.map(({ id }) => id) : undefined,
  });
  const searchLabel = reverse ? "Найти запись, основанную на этой" : "Найти первоисточник";
  const normalizedQuery = normalizeSearchText(query);
  const searchParams = new URLSearchParams({ type, q: normalizedQuery, entry: String(entryId) });
  for (const source of sources) {
    if (source.type === type) searchParams.append("exclude", String(source.id));
  }
  const searchKey = open && !pending && normalizedQuery.length >= 2 ? searchParams.toString() : "";

  useEffect(() => {
    if (!searchKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/entry-sources/search?${searchKey}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const { items } = await response.json() as { items: EntrySourceSearchOption[] };
        if (!controller.signal.aborted) setResult({ key: searchKey, items });
      } catch {
        if (!controller.signal.aborted) setResult({ key: searchKey, items: [], error: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey]);

  const activeResult = result?.key === searchKey ? result : undefined;
  const options = activeResult?.items ?? [];
  const activeOption = options[activeIndex];
  const showOptions = open && !pending;

  function selectSource(option: EntrySourceOption) {
    setSources((current) => [...current, option]);
    setQuery("");
    setActiveIndex(0);
    setOpen(false);
  }

  function getSourceTypeLabel(source: EntrySourceOption) {
    const roles = source.type === "creator" ? creatorRoles[source.id] : undefined;
    return roles?.join(", ") || ENTRY_SOURCE_LABELS[source.type];
  }

  function removeSource(source: EntrySourceOption) {
    const key = entrySourceKey(source);
    setSources((current) => current.filter((item) => entrySourceKey(item) !== key));
  }

  return (
    <form action={action} className="grid gap-3">
      <fieldset disabled={pending} className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!reverse ? <select
            aria-label="Тип первоисточника"
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm"
            value={type}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isEntrySourceType(value)) {
                setType(value);
                setActiveIndex(0);
                setOpen(false);
              }
            }}
          >
            {Object.entries(ENTRY_SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select> : null}
          <div className="relative min-w-48 flex-1" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
          }}>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-stone-400" />
            <SearchInput
              aria-label={searchLabel}
              role="combobox"
              aria-autocomplete="list"
              aria-controls={showOptions ? listboxId : undefined}
              aria-expanded={showOptions}
              aria-activedescendant={activeOption ? `${listboxId}-${activeIndex}` : undefined}
              autoComplete="off"
              className="pl-9"
              maxLength={200}
              placeholder={searchLabel}
              value={query}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && showOptions) {
                  event.preventDefault();
                  setOpen(false);
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (activeOption) selectSource(activeOption);
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setOpen(true);
                  if (!options.length) return;
                  const nextIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
                  setActiveIndex(nextIndex);
                  document.getElementById(`${listboxId}-${nextIndex}`)?.scrollIntoView({ block: "nearest" });
                }
              }}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
                setOpen(true);
              }}
            />
            {showOptions ? (
              <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
                <div id={listboxId} role="listbox" aria-label={reverse ? "Записи на основе текущей" : "Первоисточники"} className="max-h-72 overflow-y-auto p-1">
                  {options.map((option, index) => (
                    <button
                      key={entrySourceKey(option)}
                      id={`${listboxId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      tabIndex={-1}
                      className="block w-full rounded-sm px-2.5 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100 aria-selected:bg-stone-100"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSource(option)}
                    >
                      <span className="block truncate font-medium">{option.label}</span>
                      {option.mediaTypeName ? (
                        <span className="block truncate text-xs text-stone-500">
                          {option.mediaTypeName}{option.releaseYear !== null ? ` · ${option.releaseYear}` : ""}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {!options.length ? (
                  <p role={activeResult?.error ? "alert" : "status"} className="px-2.5 pb-3 pt-2 text-sm text-stone-500">
                    {!searchKey ? "Введите хотя бы два символа"
                      : !activeResult ? "Поиск…"
                        : activeResult.error ? "Не удалось выполнить поиск." : "Ничего не найдено."}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          {type === "entry" ? (
            <Button type="button" variant="outline" onClick={() => {
              setOpen(false);
              setBrowserOpen(true);
            }}>
              Открыть браузер записей
            </Button>
          ) : null}
        </div>
        {sources.map((source) => {
          const key = entrySourceKey(source);
          return <input key={key} type="hidden" name="source" value={key} />;
        })}
        {sources.length > 0 && (
          <>
            <TableWrap className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Название</TH>
                    <TH>Тип</TH>
                    <TH>Действия</TH>
                  </TR>
                </THead>
                <TBody>
                  {sources.map((source) => (
                    <TR key={entrySourceKey(source)}>
                      <TD><SourceRowTitle source={source} /></TD>
                      <TD>{getSourceTypeLabel(source)}</TD>
                      <TD className="w-px"><SourceRowActions source={source} onRemove={() => removeSource(source)} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <ul className="grid gap-2 md:hidden">
              {sources.map((source) => (
                <li key={entrySourceKey(source)} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 p-3">
                  <div className="min-w-0 break-words text-sm">
                    <SourceRowTitle source={source} />
                    <p className="mt-1 text-xs text-stone-500">{getSourceTypeLabel(source)}</p>
                  </div>
                  <SourceRowActions source={source} onRemove={() => removeSource(source)} />
                </li>
              ))}
            </ul>
          </>
        )}
        <Button type="submit" className="justify-self-start">{reverse ? "Сохранить список записей" : "Сохранить первоисточники"}</Button>
      </fieldset>
      {browserOpen ? (
        <MediaBrowserDialog
          title={reverse ? "Выбрать записи на основе текущей" : "Выбрать записи-первоисточники"}
          endpoint="/api/admin/media-browser?scope=entry-sources"
          initialSearchQuery={query}
          excludedIds={[entryId, ...sources.filter((source) => source.type === "entry").map((source) => source.id)]}
          mediaTypes={mediaTypes}
          series={series}
          onClose={() => setBrowserOpen(false)}
          onConfirm={(items) => {
            setSources((current) => [...current, ...items.map((item) => ({
              type: "entry" as const,
              id: item.id,
              label: item.title,
              code: item.code,
              mediaTypeName: item.mediaTypeLabel,
              releaseYear: item.releaseYear,
            }))]);
            setQuery("");
            setActiveIndex(0);
            setBrowserOpen(false);
          }}
        />
      ) : null}
      {state.message ? <p role={state.error ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
