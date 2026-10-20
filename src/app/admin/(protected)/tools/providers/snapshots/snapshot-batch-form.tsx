"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { SNAPSHOT_DEFAULT_BATCH_SIZE, SNAPSHOT_MAX_BATCH_SIZE, SNAPSHOT_MAX_PAUSE_HOURS, type SnapshotJobPayload, type SnapshotOperation } from "@/lib/providers/snapshot-job-payload";
import { enqueueProviderSnapshotAction } from "./actions";

import { SNAPSHOT_OPERATIONS_UI } from "./snapshot-operations";

function BatchFields({ busy, values }: { busy: boolean; values?: SnapshotJobPayload }) {
  const { pending } = useFormStatus();
  const [entityType, setEntityType] = useState(values?.entityType ?? "media-item");
  const creator = entityType === "creator";
  const [operation, setOperation] = useState<SnapshotOperation>(values?.operation ?? "verify");
  return <>
    <fieldset disabled={pending || busy} className="grid gap-4 rounded-md border border-stone-200 bg-white p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Параметры обработки</legend>
      <div className="grid gap-2"><Label htmlFor="snapshot-entity">Объекты обработки</Label><Select id="snapshot-entity" name="entityType" value={entityType} onChange={event => { setEntityType(event.target.value as "media-item" | "creator"); if (event.target.value === "creator" && operation === "verify") setOperation("refresh-process"); }}><option value="media-item">Книги</option><option value="creator">Создатели FantLab</option></Select></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="snapshot-provider">Провайдер</Label>
          <Select key={entityType} id="snapshot-provider" name="provider" defaultValue={creator ? "fantlab" : values?.provider ?? "fantlab"}>
            {(creator ? ["fantlab"] as const : ["fantlab", "google-books", "open-library"] as const).map(provider => <option key={provider} value={provider}>{COVER_PROVIDER_LABELS[provider]}</option>)}
          </Select>
          <p className="text-xs leading-5 text-stone-500">{creator ? "Создатели с подтверждённой привязкой FantLab. Новые сопоставления не создаются." : "Книги с уже выбранным источником. Поиск нового источника не выполняется."}</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="snapshot-operation">Действие</Label>
          <Select id="snapshot-operation" name="operation" value={operation} onChange={event => setOperation(event.target.value as SnapshotOperation)} aria-describedby="snapshot-operation-description">
            {Object.entries(SNAPSHOT_OPERATIONS_UI).filter(([value]) => !creator || value !== "verify").map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </Select>
          <p id="snapshot-operation-description" className="text-xs leading-5 text-stone-500">{creator && (operation === "process" || operation === "refresh-process") ? (operation === "process" ? "Обработает сохранённый снимок без запросов к провайдеру. " : "Получит полный ответ FantLab и обработает его. ") + "Заполнит пустые даты жизни людей. Ручные значения сохраняются; псевдонимам и коллективам даты не назначаются." : SNAPSHOT_OPERATIONS_UI[operation].description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="snapshot-batch-size">Записей в одной партии</Label>
          <Input id="snapshot-batch-size" name="batchSize" type="number" min="1" max={SNAPSHOT_MAX_BATCH_SIZE} step="1" required defaultValue={values?.batchSize ?? SNAPSHOT_DEFAULT_BATCH_SIZE} />
          <p className="text-xs leading-5 text-stone-500">От 1 до {SNAPSHOT_MAX_BATCH_SIZE}. По умолчанию — {SNAPSHOT_DEFAULT_BATCH_SIZE} записей.</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="snapshot-batch-pause">Пауза между партиями, часы</Label>
          <Input id="snapshot-batch-pause" name="batchPauseHours" type="number" min="0" max={SNAPSHOT_MAX_PAUSE_HOURS} step="any" required defaultValue={values?.batchPauseHours ?? 0} />
          <p className="text-xs leading-5 text-stone-500">0 — пауза 1 секунда. Можно указать дробное число: 0,5 — полчаса; 24 — сутки.</p>
        </div>
      </div>
      {creator && operation !== "process" && <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="onlyMissingSnapshots" defaultChecked={values?.onlyMissingSnapshots ?? false} />Только без сохранённого снимка</label>
        <p className="text-xs leading-5 text-stone-500">Успешно загруженные профили будут пропущены. Проверяется полный снимок FantLab с биографией и наградами, независимо от заполненности полей создателя. Для обработки уже сохранённых данных выберите «Применить сохранённые данные».</p>
      </div>}
      {creator && <div className="grid gap-2"><Label htmlFor="snapshot-creator-ids">ID создателей (необязательно)</Label><Input id="snapshot-creator-ids" name="creatorIds" defaultValue={values?.creatorIds?.join(", ")} placeholder="12, 34, 56" maxLength={3200} /><p className="text-xs text-stone-500">До 200 положительных ID через запятую или пробел. Пустое поле — все подходящие создатели в диапазоне.</p></div>}
      <details className="rounded-md border border-stone-100 p-3">
        <summary className="cursor-pointer text-sm font-medium">Ограничить диапазон записей</summary>
        <p className="mt-2 text-xs leading-5 text-stone-500">{creator ? "Если оставить поля пустыми, будут обработаны все создатели с привязкой FantLab." : "Если оставить поля пустыми, будут обработаны все книги выбранного провайдера."}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="snapshot-after-id">После ID</Label>
            <Input id="snapshot-after-id" name="afterId" type="number" min="0" defaultValue={values?.afterId} placeholder="Необязательно" />
            <p className="text-xs text-stone-500">Указанная запись не включается.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="snapshot-through-id">До ID включительно</Label>
            <Input id="snapshot-through-id" name="throughId" type="number" min="1" defaultValue={values?.throughId} placeholder="Необязательно" />
          </div>
        </div>
      </details>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || busy}>{pending ? <LoaderCircle className="animate-spin" /> : <Play />}{pending ? "Запускаем…" : "Запустить обработку"}</Button>
      <p className="text-xs leading-5 text-stone-500">Ход выполнения и результат появятся ниже. Журнал можно открыть отдельно.</p>
    </div>
  </>;
}

export function SnapshotBatchForm({ busy = false, values }: { busy?: boolean; values?: SnapshotJobPayload }) {
  return <form action={enqueueProviderSnapshotAction} className="grid gap-4 rounded-md border border-stone-200 bg-stone-50/60 p-4"><BatchFields busy={busy} values={values} /></form>;
}
