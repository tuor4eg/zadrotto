"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { getMigrationDefinition } from "@/lib/jobs/catalog";
import { enqueueMigrationJobAction } from "../actions";

export function MigrationForm({ type }: { type: string }) {
  const definition = getMigrationDefinition(type);
  const [dryRun, setDryRun] = useState(true);
  const [batchSize, setBatchSize] = useState("25");
  const [targetId, setTargetId] = useState("");
  const [afterId, setAfterId] = useState("");
  if (!definition) return null;
  const configurable = definition.form !== "empty";
  const payload = configurable ? {
    dryRun, [definition.form === "tmdb" ? "batchSize" : "limit"]: Number(batchSize),
    ...(targetId ? { [definition.form === "fantlab" ? "creatorId" : "mediaItemId"]: Number(targetId) } : {}),
    ...(afterId ? { afterId: Number(afterId) } : {}),
  } : {};
  return <form action={enqueueMigrationJobAction} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="type" value={type} /><input type="hidden" name="payload" value={JSON.stringify(payload)} />
    {configurable ? <>
      <label className="grid gap-2 text-sm">Размер партии<Input type="number" min={1} max={100} step={1} required value={batchSize} onChange={event => setBatchSize(event.currentTarget.value)} /></label>
      <label className="grid gap-2 text-sm">{definition.form === "fantlab" ? "ID создателя" : "ID записи"} (необязательно)<Input type="number" min={1} step={1} value={targetId} onChange={event => setTargetId(event.currentTarget.value)} /></label>
      <label className="grid gap-2 text-sm">После ID (необязательно)<Input type="number" min={0} step={1} value={afterId} onChange={event => setAfterId(event.currentTarget.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dryRun} onChange={event => setDryRun(event.currentTarget.checked)} />Проверка без применения (dryRun)</label>
    </> : <p className="text-sm text-stone-600 sm:col-span-2">Параметры не требуются. Запуск применяет перенос и использует существующий механизм продолжения.</p>}
    <div className="sm:col-span-2"><Button type="submit">{configurable && dryRun ? "Проверить перенос" : "Запустить перенос"}</Button></div>
  </form>;
}
