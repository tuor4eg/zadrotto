import type { ReactNode } from "react";
import { SnapshotJsonCopyButton } from "./snapshot-json-copy-button";

// Avoid creating thousands of React nodes for a large, otherwise unbounded API response.
const HIGHLIGHT_LIMIT = 50_000;
function highlightJson(text: string): ReactNode {
  if (text.length > HIGHLIGHT_LIMIT) return text;
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
  const text = JSON.stringify(value, null, 2) ?? "null";
  return <div className="min-w-0 overflow-hidden rounded-lg border border-stone-200">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-stone-50 px-3 py-2">
      <span className="font-mono text-xs font-semibold text-stone-600">JSON · строк: {text.split("\n").length.toLocaleString("ru-RU")}</span>
      <SnapshotJsonCopyButton codeId="provider-json-code" />
    </div>
    <pre className="max-h-[32rem] overflow-auto bg-stone-950 p-4 text-xs leading-6 text-stone-200" tabIndex={0} aria-label="Сохранённые данные в формате JSON">
      <code id="provider-json-code" className="font-mono">{highlightJson(text)}</code>
    </pre>
  </div>;
}
