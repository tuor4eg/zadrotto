"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/form";

const FIELDS: Record<string, { key: string; label: string; min: number; max?: number }[]> = {
  "media.creator-name-localization": [{ key: "batchSize", label: "Персон за запрос (по умолчанию 20)", min: 1, max: 50 }, { key: "requestsPerMinute", label: "Запросов в минуту (по умолчанию 5)", min: 1, max: 100 }, { key: "requestsPerDay", label: "Запросов в сутки (по умолчанию 200)", min: 1, max: 100000 }],
  "media.metadata-backfill": [{ key: "limit", label: "Лимит записей", min: 1, max: 200 }, { key: "quotaReserve", label: "Резерв квоты", min: 0, max: 10000 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1 }],
  "media.metadata-refresh": [{ key: "limit", label: "Лимит записей", min: 1, max: 200 }, { key: "staleDays", label: "Порог устаревания, дней", min: 1, max: 3650 }, { key: "quotaReserve", label: "Резерв квоты", min: 0, max: 10000 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1 }],
  "media.cover-thumbnails-backfill": [{ key: "limit", label: "Лимит записей", min: 1, max: 200 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1 }],
  "media.rating-stats-reconcile": [{ key: "batchSize", label: "Размер партии", min: 1, max: 500 }, { key: "afterMediaItemId", label: "После ID записи (необязательно)", min: 1 }],
};

export function JobPayloadFields({ type, initialPayload = {}, mediaTypes = [], preserveWithoutFields = false }: { type: string; initialPayload?: Record<string, unknown>; mediaTypes?: { code: string; name: string }[]; preserveWithoutFields?: boolean }) {
  const [payload, setPayload] = useState(initialPayload);
  const fields = FIELDS[type];
  if (type === "media.creator-request-auto-approve") return <div className="col-span-full rounded-md border bg-stone-50 p-3 text-sm text-stone-600">
    Будут проверены все ожидающие заявки на создателей. Возможные совпадения останутся на ручном разборе.
    <input type="hidden" name="payload" value="{}" />
  </div>;
  const set = (key: string, value: unknown) => setPayload(previous => {
    const next = { ...previous };
    if (value === undefined) delete next[key]; else next[key] = value;
    return next;
  });
  if (!fields) return <div className="col-span-full rounded-md border bg-stone-50 p-3 text-sm text-stone-600">Параметры этого обработчика управляются его предметными настройками. Сохранённые параметры не изменяются.{preserveWithoutFields ? null : <input type="hidden" name="payload" value={JSON.stringify(payload)} />}</div>;
  return <div className="col-span-full grid gap-3 rounded-md border bg-stone-50 p-3 sm:grid-cols-2">
    <input type="hidden" name="payload" value={JSON.stringify(payload)} />
    {fields.map(field => <label key={field.key} className="grid gap-2"><span className="text-sm">{field.label}</span><Input type="number" min={field.min} max={field.max} step={1} value={typeof payload[field.key] === "number" ? String(payload[field.key]) : ""} placeholder="По умолчанию" onChange={event => set(field.key, event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value))} /></label>)}
    {type === "media.metadata-backfill" ? <>
      <label className="grid gap-2"><span className="text-sm">Тип записи</span><Select value={typeof payload.mediaType === "string" ? payload.mediaType : ""} onChange={event => set("mediaType", event.currentTarget.value || undefined)}><option value="">Все типы</option>{mediaTypes.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</Select></label>
      {([ ["force", "Повторно загрузить метаданные"], ["partsOnly", "Только части сериалов без сезонов"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payload[key] === true} onChange={event => set(key, event.currentTarget.checked)} />{label}</label>)}
    </> : null}
  </div>;
}
