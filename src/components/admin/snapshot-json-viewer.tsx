"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SnapshotJsonCopyButton } from "./snapshot-json-copy-button";

const WINDOW_THRESHOLD = 50_000;
const LINE_HEIGHT = 24;
const VISIBLE_LINES = 22;
const OVERSCAN_LINES = 20;
function highlightJson(text: string): ReactNode {
  const tokens = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const result: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index!;
    if (index > offset) result.push(text.slice(offset, index));
    const token = match[0];
    const color = match[2] ? "text-sky-300" : match[1] ? "text-emerald-300"
      : token === "null" ? "text-stone-400" : token === "true" || token === "false" ? "text-violet-300" : "text-amber-300";
    result.push(<span key={index} className={color}>{token}</span>);
    offset = index + token.length;
  }
  result.push(text.slice(offset));
  return result;
}

export function SnapshotJsonViewer({ value }: { value: unknown }) {
  const { xml, text, lines, longestLine } = useMemo(() => {
    const xml = typeof value === "string" && value.trimStart().startsWith("<");
    const text = xml ? value : JSON.stringify(value, null, 2) ?? "null";
    const lines = text.split("\n");
    return { xml, text, lines, longestLine: lines.reduce((max, line) => Math.max(max, line.length), 0) };
  }, [value]);
  const [scrollTop, setScrollTop] = useState(0);
  const windowed = !xml && text.length > WINDOW_THRESHOLD && lines.length > VISIBLE_LINES + OVERSCAN_LINES * 2;
  const start = windowed ? Math.max(0, Math.min(lines.length - VISIBLE_LINES, Math.floor(scrollTop / LINE_HEIGHT)) - OVERSCAN_LINES) : 0;
  const end = windowed ? Math.min(lines.length, start + VISIBLE_LINES + OVERSCAN_LINES * 2) : lines.length;
  const content = useMemo(() => xml ? text : highlightJson(windowed ? lines.slice(start, end).join("\n") : text), [xml, text, windowed, lines, start, end]);
  return <div className="min-w-0 overflow-hidden rounded-lg border border-stone-200">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-stone-50 px-3 py-2">
      <span className="font-mono text-xs font-semibold text-stone-600">{xml ? "XML" : "JSON"} · строк: {lines.length.toLocaleString("ru-RU")}</span>
      <SnapshotJsonCopyButton text={text} />
    </div>
    <div className={`${windowed ? "h-[32rem]" : "max-h-[32rem]"} overflow-auto bg-stone-950 p-4 font-mono text-xs leading-6 text-stone-200`} tabIndex={0}
      aria-label={`Сохранённые данные в формате ${xml ? "XML" : "JSON"}`} onScroll={windowed ? event => setScrollTop(event.currentTarget.scrollTop) : undefined}>
      <pre className="m-0" style={windowed ? { minWidth: `${longestLine}ch`, paddingTop: start * LINE_HEIGHT, paddingBottom: (lines.length - end) * LINE_HEIGHT } : undefined}>
        <code className="font-mono">{content}</code>
      </pre>
    </div>
  </div>;
}
