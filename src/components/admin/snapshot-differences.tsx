import { getSnapshotDifferences, type SnapshotDifference } from "@/lib/providers/snapshot-diff";

const labels = {added:"Добавлено",removed:"Удалено",changed:"Изменено"};
function Value({value,missing}:{value:unknown;missing:boolean}) {
  return missing ? <p className="text-sm italic text-stone-500">Нет поля</p>
    : <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-stone-50 p-3 text-xs">{JSON.stringify(value,null,2) ?? "undefined"}</pre>;
}
function Difference({difference,proposedLabel}:{difference:SnapshotDifference;proposedLabel:string}) {
  return <article className="min-w-0 space-y-3 rounded-md border p-4">
    <h4 className="text-sm font-semibold">{labels[difference.kind]}: <code className="break-all">{difference.path}</code></h4>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="min-w-0 space-y-1"><p className="text-xs text-stone-500">Сейчас в записи</p><Value value={difference.current} missing={difference.kind === "added"} /></div>
      <div className="min-w-0 space-y-1"><p className="text-xs text-stone-500">{proposedLabel}</p><Value value={difference.proposed} missing={difference.kind === "removed"} /></div>
    </div>
  </article>;
}

export function SnapshotDifferences({current,proposed,proposedLabel="В снимке провайдера",description}:{current:unknown;proposed:unknown;proposedLabel?:string;description?:string}) {
  const differences = getSnapshotDifferences(current,proposed);
  return <section className="space-y-3">
    <h3 className="font-semibold">Конкретные отличия{differences.length ? ` · ${differences.length}` : ""}</h3>
    <p className="text-sm text-stone-500">{description ?? "Различия показанных значений. Порядок элементов списков с именами или ID не учитывается; решения модерации и ручные назначения могут объяснять отличия."}</p>
    {differences.length ? differences.map((difference,index) => <Difference key={`${difference.path}:${index}`} difference={difference} proposedLabel={proposedLabel} />)
      : <p className="text-sm text-stone-600">Различий в показанных значениях нет.</p>}
  </section>;
}
