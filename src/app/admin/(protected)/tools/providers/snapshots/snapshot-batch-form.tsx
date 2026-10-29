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
  const [processingType, setProcessingType] = useState<"book" | "film" | "series" | "anime" | "game" | "boardgame" | "comic" | "roblox" | "creator">(
    values?.entityType === "creator" ? "creator" : values?.mediaType === "roblox" ? "roblox" : values?.mediaType === "comic" ? "comic" : values?.mediaType === "boardgame" ? "boardgame" : values?.mediaType === "game" ? "game" : values?.mediaType === "anime" ? "anime" : values?.mediaType === "series" ? "series" : values?.mediaType === "film" || values?.provider === "tmdb" ? "film" : "book",
  );
  const creator = processingType === "creator";
  const anime = processingType === "anime";
  const boardgame = processingType === "boardgame";
  const comic = processingType === "comic";
  const roblox = processingType === "roblox";
  const game = processingType === "game";
  const film = ["film", "series"].includes(processingType);
  const [creatorProvider, setCreatorProvider] = useState(values?.entityType === "creator" ? values.provider ?? "" : "");
  const [applyBoardgameChanges, setApplyBoardgameChanges] = useState(values?.applyBoardgameChanges ?? false);
  const [applyGameChanges, setApplyGameChanges] = useState(values?.applyGameChanges ?? false);
  const [operation, setOperation] = useState<SnapshotOperation>(values?.operation ?? "verify");
  const safeTransfer = boardgame ? !applyBoardgameChanges : game && !applyGameChanges;
  return <>
    <fieldset disabled={pending || busy} className="grid gap-4 rounded-md border border-stone-200 bg-white p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Параметры обработки</legend>
      <div className="grid gap-2"><Label htmlFor="snapshot-entity">Объекты обработки</Label><Select id="snapshot-entity" name="processingType" value={processingType} onChange={event => { setProcessingType(event.target.value as "book" | "film" | "series" | "anime" | "game" | "boardgame" | "comic" | "roblox" | "creator"); if (event.target.value === "creator" && (operation === "verify" || creatorProvider !== "fantlab")) setOperation("refresh"); }}><option value="book">Книги</option><option value="film">Фильмы</option><option value="series">Сериалы</option><option value="anime">Аниме</option><option value="game">Видеоигры</option><option value="boardgame">Настольные игры</option><option value="comic">Комиксы</option><option value="roblox">Roblox</option><option value="creator">Создатели</option></Select><input type="hidden" name="entityType" value={creator ? "creator" : "media-item"} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="snapshot-provider">Провайдер</Label>
          <Select key={processingType} id="snapshot-provider" name="provider" onChange={event => { if (creator) { setCreatorProvider(event.target.value); if (event.target.value !== "fantlab") setOperation("refresh"); } }} defaultValue={creator ? values?.provider ?? "" : roblox ? "roblox" : comic ? "comic-vine" : boardgame ? "bgg" : game ? (["igdb", "rawg"].includes(values?.provider ?? "") ? values?.provider : "igdb") : anime ? "anilist" : film ? "tmdb" : ["fantlab", "google-books", "open-library"].includes(values?.provider ?? "") ? values?.provider : "fantlab"}>
            {creator && <option value="">Все поддерживаемые источники</option>}
            {(creator ? ["fantlab", "tmdb", "igdb", "rawg", "anilist", "comic-vine", "roblox"] as const : roblox ? ["roblox"] as const : comic ? ["comic-vine"] as const : boardgame ? ["bgg"] as const : game ? ["igdb", "rawg"] as const : anime ? ["anilist"] as const : film ? ["tmdb"] as const : ["fantlab", "google-books", "open-library"] as const).map(provider => <option key={provider} value={provider}>{COVER_PROVIDER_LABELS[provider]}</option>)}
          </Select>
          <p className="text-xs leading-5 text-stone-500">{creator ? "Создатели с подтверждёнными внешними привязками. Загрузка raw автоматически связывает снимки, но не меняет рабочие поля." : roblox ? "Игры с уже выбранным источником Roblox." : comic ? "Комиксы с уже выбранным источником Comic Vine. Поиск нового источника не выполняется." : boardgame ? "Настольные игры с уже выбранным источником BGG. Поиск нового источника не выполняется." : game ? "Видеоигры с уже выбранным источником IGDB или RAWG. Поиск нового источника не выполняется. По умолчанию выполняется проверенный перенос без изменения существующих связей." : anime ? "Аниме с источником AniList либо Jikan через точное соответствие MAL ID. Обрабатываются режиссёры, производственные компании и продюсеры; остальные характеристики записи не меняются. После подтверждения создателей изображения заполняются в фоне." : film ? `${processingType === "series" ? "Сериалы" : "Фильмы"} с уже выбранным источником TMDB. Поиск нового источника не выполняется.` : "Книги с уже выбранным источником. Поиск нового источника не выполняется."}</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="snapshot-operation">Действие</Label>
          <Select id="snapshot-operation" name="operation" value={operation} onChange={event => setOperation(event.target.value as SnapshotOperation)} aria-describedby="snapshot-operation-description">
            {Object.entries(SNAPSHOT_OPERATIONS_UI).filter(([value]) => !creator || (creatorProvider === "fantlab" ? value !== "verify" : value === "refresh")).map(([value, item]) => <option key={value} value={value}>{safeTransfer && value === "process" ? "Перенести совпадающие данные" : safeTransfer && value === "refresh-process" ? "Получить и перенести совпадающие данные" : item.label}</option>)}
          </Select>
          <p id="snapshot-operation-description" className="text-xs leading-5 text-stone-500">{creator && (operation === "process" || operation === "refresh-process") ? (operation === "process" ? "Обработает сохранённый снимок без запросов к провайдеру. " : "Получит полный ответ FantLab и обработает его. ") + "Заполнит пустые даты жизни людей. Ручные значения сохраняются; псевдонимам и коллективам даты не назначаются." : safeTransfer && (operation === "process" || operation === "refresh-process") ? "Сравнит данные с существующими связями. При совпадении отметит перенос и очистит старые дубли. При расхождениях сохранит отчёт; связи сохранятся, новые задачи сопоставления не появятся." : SNAPSHOT_OPERATIONS_UI[operation].description}</p>
        </div>
      </div>
      {boardgame && ["process", "refresh-process"].includes(operation) ? <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="applyBoardgameChanges" checked={applyBoardgameChanges} onChange={event => setApplyBoardgameChanges(event.target.checked)} />Применять изменения жанров, создателей и характеристик</label>
        <p className="text-xs leading-5 text-stone-500">Без отметки данные BGG переносятся только при совпадении. При расхождениях сохраняется отчёт, связи и заявки не меняются.</p>
      </div> : null}
      {game && (operation === "process" || operation === "refresh-process") ? <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="applyGameChanges" checked={applyGameChanges} onChange={event => setApplyGameChanges(event.target.checked)} />Применять изменения жанров, платформ и компаний</label>
        <p className="text-xs leading-5 text-stone-500">Без отметки данные только сравниваются: при совпадении отмечается перенос и удаляются старые дубли; при расхождениях сохраняется отчёт без изменения связей и новых задач. С отметкой будут применены изменения из сохранённых данных с учётом ручных назначений и решений модерации.</p>
      </div> : null}
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
      {(operation === "refresh" || operation === "refresh-process") && <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="onlyMissingSnapshots" defaultChecked={values?.onlyMissingSnapshots ?? false} />Только без снимков</label>
        <p className="text-xs leading-5 text-stone-500">{creator ? "Источники с сохранённым полным профилем будут пропущены, независимо от заполненности полей создателя." : anime ? "Записи с полным снимком состава AniList будут пропущены, независимо от применения связей." : "Записи с основным снимком текущего источника будут пропущены, независимо от заполненности полей записи. Проверяется ресурс, метод и параметры запроса; привязка снимка к записи не требуется."} Загрузка raw не применяет рабочие данные.</p>
      </div>}
      {creator && <div className="grid gap-2"><Label htmlFor="snapshot-creator-ids">ID создателей (необязательно)</Label><Input id="snapshot-creator-ids" name="creatorIds" defaultValue={values?.creatorIds?.join(", ")} placeholder="12, 34, 56" maxLength={3200} /><p className="text-xs text-stone-500">До 200 положительных ID через запятую или пробел. Пустое поле — все подходящие создатели в диапазоне.</p></div>}
      <details className="rounded-md border border-stone-100 p-3">
        <summary className="cursor-pointer text-sm font-medium">Ограничить диапазон записей</summary>
        <p className="mt-2 text-xs leading-5 text-stone-500">{creator ? "Если оставить поля пустыми, будут обработаны все создатели с поддерживаемыми подтверждёнными привязками." : roblox ? "Если оставить поля пустыми, будут обработаны все записи Roblox с выбранным источником." : comic ? "Если оставить поля пустыми, будут обработаны все комиксы с источником Comic Vine." : boardgame ? "Если оставить поля пустыми, будут обработаны все настольные игры с источником BGG." : game ? "Если оставить поля пустыми, будут обработаны все видеоигры выбранного провайдера." : anime ? "Если оставить поля пустыми, будут обработаны все подходящие аниме с источником AniList или Jikan." : film ? "Если оставить поля пустыми, будут обработаны все записи выбранного типа с источником TMDB." : "Если оставить поля пустыми, будут обработаны все книги выбранного провайдера."}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="snapshot-after-id">После ID</Label>
            <Input id="snapshot-after-id" name="afterId" type="number" min="0" defaultValue={values?.afterId} placeholder="Необязательно" />
            <p className="text-xs text-stone-500">{creator && operation === "refresh" ? "Курсор подтверждённых привязок; указанная привязка не включается." : "Указанная запись не включается."}</p>
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
