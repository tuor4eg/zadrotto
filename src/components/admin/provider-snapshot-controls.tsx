"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { enqueueProviderSnapshotAction } from "@/app/admin/(protected)/tools/providers/snapshots/actions";
import { Button } from "@/components/ui/button";

function SnapshotButtons({ canProcess, busy, creator }: { canProcess: boolean; busy: boolean; creator: boolean }) {
  const { pending } = useFormStatus();
  const disabled = busy || pending;
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="operation" value="refresh" variant={canProcess ? "outline" : "default"} disabled={disabled}>{canProcess ? "Получить заново" : "1. Получить данные"}</Button>
      <Link className="inline-flex items-center rounded-md border px-4 py-2 text-sm underline" href="#comparison">{creator ? "2. Сравнить даты" : "2. Сравнить с записью"}</Link>
      <Button type="submit" name="operation" value="process" variant="positive" disabled={disabled || !canProcess}>{creator ? "3. Применить даты" : "3. Применить к записи"}</Button>
    </div>
    {pending && <p role="status" className="text-sm">Создаём задачу…</p>}
    <details className="text-sm">
      <summary className="cursor-pointer">Дополнительные действия</summary>
      <div className="flex flex-wrap gap-2 pt-3">
        <Button type="submit" name="operation" value="refresh-process" variant="outline" disabled={disabled}>Получить и сразу применить</Button>
        {!creator && <Button type="submit" name="operation" value="verify" variant="outline" disabled={disabled || !canProcess}>Проверить перенос данных</Button>}
      </div>
    </details>
  </div>;
}

export function ProviderSnapshotControls({ mediaItemId, creatorId, provider, mediaType, showActions = false, canProcess = false, busy = false }: {
  mediaItemId?: number; creatorId?: number; mediaType?: "book" | "film" | "series" | "anime"; provider?: "tmdb" | "anilist"; showActions?: boolean; canProcess?: boolean; busy?: boolean;
}) {
  const creator = creatorId !== undefined;
  return <section className="rounded-md border border-stone-200 p-4 space-y-3">
    <h3 className="font-semibold">Данные источника</h3>
    <p className="text-sm text-stone-600">{creator && showActions ? "Отдельная обработка FantLab заполняет пустые даты жизни; заполненные значения сохраняются." : creator ? "Сохраните полные ответы подтверждённых источников. Загрузка raw не меняет рабочие данные создателя." : mediaType === "anime" ? "Получите состав AniList: режиссёров, производственные компании и продюсеров. Ручные назначения сохраняются; остальные характеристики записи не меняются." : "Получите данные провайдера, сравните их с записью и примените. Ручные назначения сохраняются."}</p>
    {showActions ? <form action={enqueueProviderSnapshotAction}>
      {creator ? <><input type="hidden" name="entityType" value="creator" /><input type="hidden" name="creatorId" value={creatorId} /><input type="hidden" name="provider" value="fantlab" /></> : <><input type="hidden" name="mediaItemId" value={mediaItemId} />{mediaType && <input type="hidden" name="mediaType" value={mediaType} />}{provider && <input type="hidden" name="provider" value={provider} />}</>}
      <SnapshotButtons canProcess={canProcess} busy={busy} creator={creator} />
    </form> : <Link className="inline-flex rounded-md border px-4 py-2 text-sm font-medium underline" href={creator ? `/admin/creators/${creatorId}/snapshots` : `/admin/media/${mediaItemId}/snapshots`}>Открыть данные источников</Link>}
  </section>;
}
