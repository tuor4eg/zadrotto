"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/form";

const FIELDS: Record<string, { key: string; label: string; min: number; max?: number }[]> = {
  "media.comic-vine-issue-creators": [{ key: "limit", label: "Лимит выпусков за запуск (по умолчанию 25)", min: 1, max: 200 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1, max: 2147483647 }],
  "media.creator-name-localization": [{ key: "batchSize", label: "Персон за запрос (по умолчанию 20)", min: 1, max: 50 }, { key: "requestsPerMinute", label: "Запросов в минуту (по умолчанию 5)", min: 1, max: 100 }, { key: "requestsPerDay", label: "Запросов в сутки (по умолчанию 200)", min: 1, max: 100000 }],
  "media.metadata-backfill": [{ key: "limit", label: "Лимит записей", min: 1, max: 200 }, { key: "quotaReserve", label: "Резерв квоты", min: 0, max: 10000 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1 }],
  "media.metadata-refresh": [{ key: "limit", label: "Лимит записей", min: 1, max: 200 }, { key: "staleDays", label: "Порог устаревания, дней", min: 1, max: 3650 }, { key: "quotaReserve", label: "Резерв квоты", min: 0, max: 10000 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1 }],
  "media.creator-images-reconcile": [{ key: "batchSize", label: "Размер партии (по умолчанию 25)", min: 1, max: 100 }],
  "media.covers-reconcile": [{ key: "batchSize", label: "Размер партии (по умолчанию 25)", min: 1, max: 100 }, { key: "mediaItemId", label: "ID записи и её частей (необязательно)", min: 1, max: 2147483647 }],
  "media.cover-thumbnails-backfill": [{ key: "limit", label: "Лимит записей", min: 1, max: 200 }, { key: "mediaItemId", label: "ID записи (необязательно)", min: 1 }],
  "media.anime-shikimori-backfill": [{ key: "batchSize", label: "Размер партии (по умолчанию 1)", min: 1, max: 100 }, { key: "pauseMs", label: "Пауза между записями, мс", min: 0, max: 60000 }, { key: "afterMediaItemId", label: "После ID записи", min: 0 }],
  "media.rating-stats-reconcile": [{ key: "batchSize", label: "Размер партии", min: 1, max: 500 }, { key: "afterMediaItemId", label: "После ID записи (необязательно)", min: 1 }],
};

export function JobPayloadFields({ type, initialPayload = {}, mediaTypes = [], preserveWithoutFields = false }: { type: string; initialPayload?: Record<string, unknown>; mediaTypes?: { code: string; name: string }[]; preserveWithoutFields?: boolean }) {
  const [payload, setPayload] = useState(initialPayload);
  const fields = FIELDS[type];
  const imageScope = payload.scope === "creators" || payload.scope === "platforms" ? payload.scope : typeof payload.creatorId === "number" ? "creators" : typeof payload.platformId === "number" ? "platforms" : "all";
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
    {type === "media.creator-images-reconcile" ? <>
      <p className="col-span-full text-sm leading-6 text-stone-600">Проверяет фотографии и логотипы создателей и платформ в хранилище, включая заполненные поля. Профили, привязки и решения об одобрении сохраняются. Ручные логотипы платформ без источника попадут в отчёт. Восстановление логотипов платформ требует точного совпадения исходного содержимого.</p>
      <label className="grid gap-2"><span className="text-sm">Режим</span><Select value={payload.mode === "repair" ? "repair" : "audit"} onChange={event => set("mode", event.currentTarget.value)}><option value="audit">Проверка без изменений</option><option value="repair">Восстановление изображений</option></Select></label>
      <label className="grid gap-2"><span className="text-sm">Что проверить</span><Select value={imageScope} onChange={event => {
        const scope = event.currentTarget.value;
        setPayload(previous => {
          const next: Record<string, unknown> = { ...previous, scope };
          delete next.creatorId;
          delete next.platformId;
          delete next.checkpoint;
          return next;
        });
      }}><option value="all">Создатели и платформы</option><option value="creators">Только создатели</option><option value="platforms">Только платформы</option></Select></label>
      {imageScope === "all" ? <p className="col-span-full text-xs text-stone-500">Для пробного восстановления одной сущности выберите только создателей или только платформы и укажите ID.</p> : <label className="grid gap-2"><span className="text-sm">{imageScope === "creators" ? "ID создателя (необязательно)" : "ID платформы (необязательно)"}</span><Input type="number" min={1} max={2147483647} step={1} value={typeof payload[imageScope === "creators" ? "creatorId" : "platformId"] === "number" ? String(payload[imageScope === "creators" ? "creatorId" : "platformId"]) : ""} placeholder="Все" onChange={event => set(imageScope === "creators" ? "creatorId" : "platformId", event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value))} /></label>}
    </> : null}
    {type === "media.covers-reconcile" ? <>
      <p className="col-span-full text-sm leading-6 text-stone-600">Проверяет наличие оригиналов и миниатюр в хранилище. Партии продолжаются автоматически. Сначала выполните проверку, затем восстановление одной записи и проверьте результат перед массовым запуском.</p>
      <label className="grid gap-2"><span className="text-sm">Режим</span><Select value={payload.mode === "repair" ? "repair" : "audit"} onChange={event => set("mode", event.currentTarget.value)}><option value="audit">Проверка без изменений</option><option value="repair">Восстановление обложек</option></Select></label>
      <label className="grid gap-2"><span className="text-sm">Тип записи</span><Select value={typeof payload.mediaType === "string" ? payload.mediaType : ""} onChange={event => set("mediaType", event.currentTarget.value || undefined)}><option value="">Все типы</option>{mediaTypes.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</Select></label>
      <label className="col-span-full flex items-start gap-2 text-sm"><input type="checkbox" checked={payload.includeParts !== false} onChange={event => set("includeParts", event.currentTarget.checked)} className="mt-1" /><span>Включить части и сезоны<span className="mt-1 block text-xs text-stone-500">Фильтры типа и ID записи также ограничивают её части.</span></span></label>
      <label className="col-span-full flex items-start gap-2 text-sm"><input type="checkbox" checked={payload.includeEmpty === true} onChange={event => set("includeEmpty", event.currentTarget.checked)} className="mt-1" /><span>Включить записи без обложки<span className="mt-1 block text-xs text-stone-500">При восстановлении разрешает заполнить пустую обложку по сохранённому источнику метаданных.</span></span></label>
      <label className="col-span-full flex items-start gap-2 text-sm"><input type="checkbox" checked={payload.allowReplacement === true} onChange={event => set("allowReplacement", event.currentTarget.checked)} className="mt-1" /><span>Разрешить замену недоступного изображения<span className="mt-1 block text-xs text-stone-500">Если точный вариант недоступен или источник ручной обложки неизвестен, разрешает взять текущую обложку из подтверждённого источника метаданных. Поиск по названию не выполняется.</span></span></label>
    </> : null}
    {type === "media.anime-shikimori-backfill" ? <label className="grid gap-2"><span className="text-sm">Типы записей</span><Select value={!Array.isArray(payload.mediaTypes) ? "both" : payload.mediaTypes.includes("manga") ? payload.mediaTypes.includes("anime") ? "both" : "manga" : "anime"} onChange={event => { set("mediaTypes", event.currentTarget.value === "both" ? ["anime", "manga"] : [event.currentTarget.value]); set("checkpoint", undefined); }}><option value="anime">Аниме</option><option value="manga">Манга</option><option value="both">Аниме и манга</option></Select></label> : null}
    {fields.map(field => <label key={field.key} className="grid gap-2"><span className="text-sm">{field.label}</span><Input type="number" min={field.min} max={field.max} step={1} value={typeof payload[field.key] === "number" ? String(payload[field.key]) : ""} placeholder="По умолчанию" onChange={event => set(field.key, event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value))} /></label>)}
    {type === "media.metadata-backfill" ? <>
      <label className="grid gap-2"><span className="text-sm">Тип записи</span><Select value={typeof payload.mediaType === "string" ? payload.mediaType : ""} onChange={event => set("mediaType", event.currentTarget.value || undefined)}><option value="">Все типы</option>{mediaTypes.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</Select></label>
      {([ ["force", "Повторно загрузить метаданные"], ["partsOnly", "Только части сериалов без сезонов"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payload[key] === true} onChange={event => set(key, event.currentTarget.checked)} />{label}</label>)}
    </> : null}
  </div>;
}
