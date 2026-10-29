"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { enqueueProviderSnapshotAction } from "@/app/admin/(protected)/tools/providers/snapshots/actions";
import { Button } from "@/components/ui/button";

function SnapshotButtons({ canProcess, busy, creator, game, boardgame }: { canProcess: boolean; busy: boolean; creator: boolean; game: boolean; boardgame: boolean }) {
  const { pending } = useFormStatus();
  const [applyGameChanges, setApplyGameChanges] = useState(false);
  const [applyBoardgameChanges, setApplyBoardgameChanges] = useState(false);
  const safeTransfer = game ? !applyGameChanges : boardgame && !applyBoardgameChanges;
  const disabled = busy || pending;
  return <div className="space-y-3">
    {game ? <div className="grid gap-2">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="applyGameChanges" checked={applyGameChanges} onChange={event => setApplyGameChanges(event.target.checked)} disabled={disabled} className="mt-1" />Применять изменения жанров, платформ и компаний</label>
      <p className="text-xs leading-5 text-stone-500">Без отметки данные только сравниваются: при совпадении отмечается перенос и удаляются старые дубли; при расхождениях сохраняется отчёт без изменения связей и новых задач. С отметкой будут применены изменения с учётом ручных назначений и решений модерации.</p>
    </div> : null}
    {boardgame ? <div className="grid gap-2">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="applyBoardgameChanges" checked={applyBoardgameChanges} onChange={event => setApplyBoardgameChanges(event.target.checked)} disabled={disabled} className="mt-1" />Применять изменения жанров, создателей и характеристик</label>
      <p className="text-xs leading-5 text-stone-500">Без отметки перенос выполняется только при совпадении данных BGG. При расхождениях сохраняется отчёт; существующие связи и заявки не меняются. С отметкой изменения применяются с учётом ручных назначений и решений модерации.</p>
    </div> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="operation" value="refresh" variant={canProcess ? "outline" : "default"} disabled={disabled}>{canProcess ? "Получить заново" : "1. Получить данные"}</Button>
      <Link className="inline-flex items-center rounded-md border px-4 py-2 text-sm underline" href="#comparison">{creator ? "2. Сравнить даты" : "2. Сравнить с записью"}</Link>
      <Button type="submit" name="operation" value="process" variant="positive" disabled={disabled || !canProcess}>{creator ? "3. Применить даты" : safeTransfer ? "3. Перенести совпадающие данные" : "3. Применить к записи"}</Button>
    </div>
    {pending && <p role="status" className="text-sm">Создаём задачу…</p>}
    <details className="text-sm">
      <summary className="cursor-pointer">Дополнительные действия</summary>
      <div className="flex flex-wrap gap-2 pt-3">
        <Button type="submit" name="operation" value="refresh-process" variant="outline" disabled={disabled}>{safeTransfer ? "Получить и перенести совпадающие данные" : "Получить и сразу применить"}</Button>
        {!creator && <Button type="submit" name="operation" value="verify" variant="outline" disabled={disabled || !canProcess}>Проверить перенос данных</Button>}
      </div>
    </details>
  </div>;
}

export function ProviderSnapshotControls({ mediaItemId, creatorId, provider, mediaType, showActions = false, canProcess = false, busy = false }: {
  mediaItemId?: number; creatorId?: number; mediaType?: "book" | "film" | "series" | "anime" | "game" | "boardgame" | "comic" | "roblox"; provider?: "tmdb" | "anilist" | "igdb" | "rawg" | "bgg" | "comic-vine" | "roblox"; showActions?: boolean; canProcess?: boolean; busy?: boolean;
}) {
  const creator = creatorId !== undefined;
  return <section className="rounded-md border border-stone-200 p-4 space-y-3">
    <h3 className="font-semibold">Данные источника</h3>
    <p className="text-sm text-stone-600">{creator && showActions ? "Отдельная обработка FantLab заполняет пустые даты жизни; заполненные значения сохраняются." : creator ? "Сохраните полные ответы подтверждённых источников. Загрузка raw не меняет рабочие данные создателя." : mediaType === "boardgame" ? "Получите полный ответ BGG и сравните с записью. По умолчанию перенос сохраняет существующие связи; применение изменений включается отдельно." : mediaType === "game" ? "Получите данные провайдера и сравните с записью. По умолчанию перенос сохраняет существующие связи; применение изменений включается отдельно." : mediaType === "anime" ? "Получите состав AniList: режиссёров, производственные компании и продюсеров. Ручные назначения сохраняются; остальные характеристики записи не меняются." : "Получите данные провайдера, сравните их с записью и примените. Ручные назначения сохраняются."}</p>
    {showActions ? <form action={enqueueProviderSnapshotAction}>
      {creator ? <><input type="hidden" name="entityType" value="creator" /><input type="hidden" name="creatorId" value={creatorId} /><input type="hidden" name="provider" value="fantlab" /></> : <><input type="hidden" name="mediaItemId" value={mediaItemId} />{mediaType && <input type="hidden" name="mediaType" value={mediaType} />}{provider && <input type="hidden" name="provider" value={provider} />}</>}
      <SnapshotButtons canProcess={canProcess} busy={busy} creator={creator} game={!creator && mediaType === "game"} boardgame={!creator && mediaType === "boardgame"} />
    </form> : <Link className="inline-flex rounded-md border px-4 py-2 text-sm font-medium underline" href={creator ? `/admin/creators/${creatorId}/snapshots` : `/admin/media/${mediaItemId}/snapshots`}>Открыть данные источников</Link>}
  </section>;
}
