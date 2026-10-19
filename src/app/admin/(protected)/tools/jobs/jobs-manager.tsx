"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { History, Pencil, Play, Power, PowerOff, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { DEFAULT_EDITORIAL_SUMMARY_PROMPT, EDITORIAL_SUMMARY_GENERATE_TYPE, EDITORIAL_SUMMARY_SWEEP_TYPE } from "@/lib/media/editorial-summary";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { createJobAction, enqueueAdHocJobAction, runJobNowAction, setJobEnabledAction, updateJobAction } from "./actions";
import { ActivityLogTime } from "../activity/activity-log-time";

import type { MediaTypeOption } from "@/lib/media/types";

type Handler = { label: string; schedulable: boolean; type: string };
type Job = { code: string; cronExpression: string; enabled: boolean; historyRetentionDays: number; id: number; maxAttempts: number; nextRunAt: Date; payload: Record<string, unknown>; options: Record<string, unknown>; retryBaseSeconds: number; retryMaxSeconds: number; timeoutSeconds: number; type: string };
type LatestRun = { id: number; jobId: number | null; scheduledFor: Date; status: string };
const STATUS_LABELS: Record<string, string> = { queued: "Ожидает", running: "Выполняется", succeeded: "Готово", failed: "Ошибка", cancelled: "Отменён" };

function JobModal({ handlers, job, onClose }: { handlers: Handler[]; job?: Job; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const action = job ? updateJobAction : createJobAction;
  const [selectedType, setSelectedType] = useState(job?.type ?? handlers[0]?.type ?? "");
  const scheduleHandlers = handlers.filter((item) => item.schedulable || item.type === job?.type);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4"><button type="button" aria-label="Закрыть окно" className="absolute inset-0" onClick={onClose} /><div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-xl font-semibold">{job ? "Изменить задачу" : "Новая периодическая задача"}</h2><p id={descriptionId} className="mt-1 text-sm leading-6 text-stone-600">Задание создаёт запуски по расписанию UTC. Вы сможете включить его после сохранения.</p></div><button type="button" className="rounded-md p-2 text-stone-500 hover:bg-stone-100" aria-label="Закрыть" onClick={onClose}><X className="size-4" /></button></div><form action={action} className="grid items-start gap-x-4 gap-y-5 md:grid-cols-2"><input type="hidden" name="id" value={job?.id} /><input type="hidden" name="enabled" value={String(job?.enabled ?? false)} /><Field label="Код задачи" hint="Уникальное техническое имя, например nightly-cleanup."><Input name="code" defaultValue={job?.code} placeholder="nightly-cleanup" required /></Field><Field label="Обработчик" hint="Определяет, какую операцию выполнит worker."><Select name="type" value={selectedType} onChange={(event) => setSelectedType(event.currentTarget.value)}>{scheduleHandlers.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</Select></Field><Field label="Расписание (UTC)" hint="Cron из пяти частей. Например, 0 3 * * * — ежедневно в 03:00 UTC."><Input name="cronExpression" defaultValue={job?.cronExpression ?? "0 3 * * *"} required /></Field><Field label="Максимум попыток" hint="После исчерпания запуск станет ошибочным."><Input name="maxAttempts" defaultValue={job?.maxAttempts ?? 3} min="1" type="number" required /></Field><Field label="Таймаут, секунд" hint="После этого времени worker отменяет выполнение и применяет retry-политику."><Input name="timeoutSeconds" defaultValue={job?.timeoutSeconds ?? 300} min="1" type="number" required /></Field><Field label="Хранить историю, дней" hint="Завершённые запуски старше этого срока будут удалены."><Input name="historyRetentionDays" defaultValue={job?.historyRetentionDays ?? 30} min="1" max="365" type="number" required /></Field><Field label="Начальная пауза retry, секунд" hint="Пауза растёт экспоненциально после каждой ошибки."><Input name="retryBaseSeconds" defaultValue={job?.retryBaseSeconds ?? 60} min="1" type="number" required /></Field><Field label="Максимальная пауза retry, секунд" hint="Верхняя граница паузы между повторными попытками."><Input name="retryMaxSeconds" defaultValue={job?.retryMaxSeconds ?? 3600} min="1" type="number" required /></Field>{selectedType === EDITORIAL_SUMMARY_SWEEP_TYPE ? <div className="col-span-full grid gap-2"><Label htmlFor="editorial-job-prompt">Редакционный prompt</Label><Textarea id="editorial-job-prompt" name="prompt" defaultValue={typeof job?.options.prompt === "string" ? job.options.prompt : DEFAULT_EDITORIAL_SUMMARY_PROMPT} maxLength={8000} required /><p className="text-xs text-stone-500">Изменение prompt пометит прежние AI-справки устаревшими.</p></div> : null}<div className="self-stretch rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600"><div className="font-medium text-stone-800">Параметры задачи</div><p className="mt-1 leading-5">Выбранные сейчас обработчики не принимают параметров: они используют настройки email в админке. Для будущих типов здесь появятся отдельные понятные поля.</p><input type="hidden" name="payload" value="{}" /></div><div className="col-span-full flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Отмена</Button><Button type="submit">{job ? "Сохранить" : "Создать задачу"}</Button></div></form></div></div>;
}

function Field({ children, hint, label }: { children: React.ReactNode; hint: string; label: string }) { return <div className="grid grid-rows-[1rem_2.5rem_auto] gap-2"><Label>{label}</Label>{children}<p className="text-xs leading-5 text-stone-500">{hint}</p></div>; }

export function JobsManager({ handlers, jobs, latestRuns, mediaTypes }: { handlers: Handler[]; jobs: Job[]; latestRuns: LatestRun[]; mediaTypes: MediaTypeOption[] }) {
  const [editing, setEditing] = useState<Job | null | "new">(null);
  const latestRunByJobId = new Map(latestRuns.map((run) => [run.jobId, run]));
  const handlerLabelByType = new Map(handlers.map((handler) => [handler.type, handler.label]));
  return <><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-2xl">Расписания</h3><p className="text-sm text-stone-600">По одной строке на задачу. Полная история открывается отдельно.</p></div><div className="flex flex-wrap gap-2"><AdHocJobButton handlers={handlers} mediaTypes={mediaTypes} /><Button onClick={() => setEditing("new")}>Создать задачу</Button></div></div><TableWrap className="overflow-x-auto"><Table><THead><tr><TH>Задача</TH><TH>Расписание</TH><TH>Последний запуск</TH><TH>Следующий запуск</TH><TH>Политика</TH><TH /></tr></THead><TBody>{jobs.map((job) => { const latestRun = latestRunByJobId.get(job.id); return <TR key={job.id}><TD><div className="font-medium">{handlerLabelByType.get(job.type) ?? job.type}</div><div className="text-xs text-stone-500">{job.type} · {job.enabled ? "включена" : "выключена"}</div></TD><TD><div>{job.cronExpression}</div><div className="text-xs text-stone-500">UTC</div></TD><TD>{latestRun ? <><div>{STATUS_LABELS[latestRun.status] ?? latestRun.status}</div><ActivityLogTime value={latestRun.scheduledFor.toISOString()} /></> : "—"}</TD><TD><ActivityLogTime value={job.nextRunAt.toISOString()} /></TD><TD>{job.maxAttempts} попытки<br /><span className="text-xs text-stone-500">до {job.timeoutSeconds} сек. · история {job.historyRetentionDays} дн.</span></TD><TD><div className="flex flex-wrap gap-2"><Tooltip label="История"><Link className={buttonVariants({ size: "icon", variant: "outline" })} href={`/admin/tools/jobs/journal?job=${job.id}`} aria-label={`История запусков ${job.code}`}><History className="size-4" /></Link></Tooltip><Tooltip label="Изменить"><Button size="icon" type="button" variant="outline" aria-label={`Изменить задачу ${job.code}`} onClick={() => setEditing(job)}><Pencil className="size-4" /></Button></Tooltip><form action={runJobNowAction}><input type="hidden" name="id" value={job.id} /><Tooltip label="Запустить сейчас"><Button size="icon" type="submit" variant="outline" aria-label={`Запустить задачу ${job.code}`}><Play className="size-4" /></Button></Tooltip></form><form action={setJobEnabledAction}><input type="hidden" name="id" value={job.id} /><input type="hidden" name="enabled" value={String(!job.enabled)} /><Tooltip label={job.enabled ? "Выключить" : "Включить"}><Button size="icon" type="submit" variant="outline" aria-label={`${job.enabled ? "Выключить" : "Включить"} задачу ${job.code}`}>{job.enabled ? <PowerOff className="size-4" /> : <Power className="size-4" />}</Button></Tooltip></form></div></TD></TR>; })}</TBody></Table></TableWrap>{editing ? <JobModal handlers={handlers} job={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}</>;
}

export function AdHocJobButton({ handlers, mediaTypes }: { handlers: Handler[]; mediaTypes: MediaTypeOption[] }) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState(handlers[0]?.type ?? "");
  const [mediaType, setMediaType] = useState("");
  const [force, setForce] = useState(false);
  const [partsOnly, setPartsOnly] = useState(false);
  const [limit, setLimit] = useState("25");
  const isMetadataBackfill = selectedType === "media.metadata-backfill";
  const payload = isMetadataBackfill
    ? {
        force,
        limit: Number(limit),
        ...(partsOnly ? { partsOnly: true } : mediaType ? { mediaType } : {}),
      }
    : {};
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}>Разовый запуск</Button>
    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4">
      <button type="button" aria-label="Закрыть окно" className="absolute inset-0" onClick={() => setOpen(false)} />
      <form action={enqueueAdHocJobAction} className="relative grid max-h-[85dvh] w-full max-w-md gap-4 overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div><h2 className="text-xl font-semibold">Разовый запуск</h2><p className="mt-1 text-sm text-stone-600">Не создаёт расписание. Запуск сразу попадёт в очередь.</p></div>
        <Field label="Обработчик" hint="Выберите операцию для выполнения.">
          <Select name="type" value={selectedType} onChange={(event) => setSelectedType(event.currentTarget.value)}>
            {handlers.filter((item) => item.type !== EDITORIAL_SUMMARY_GENERATE_TYPE && item.type !== "media.game-company-enrich").map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </Select>
        </Field>
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        {isMetadataBackfill ? <>
          {partsOnly ? null : (
            <Field label="Тип записи" hint="Фильтр применяется ко всем записям выбранного типа.">
              <Select value={mediaType} onChange={(event) => setMediaType(event.currentTarget.value)}>
                <option value="">Все типы</option>
                {mediaTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Лимит записей" hint="За один запуск можно обработать от 1 до 200 записей.">
            <Input type="number" min={1} max={200} step={1} required value={limit} onChange={(event) => setLimit(event.currentTarget.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={partsOnly} onChange={(event) => {
              const checked = event.currentTarget.checked
              setPartsOnly(checked)
              if (checked) setForce(false)
            }} className="mt-1" />
            <span>Только части сериалов без сезонов<span className="mt-1 block text-xs text-stone-500">Берёт опубликованные сериалы с TMDB, у которых ещё нет сезонов. Уже заполненные батчи пропускает — можно крутить лимитами без повторов.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.currentTarget.checked)} className="mt-1" />
            <span>{partsOnly ? "Повторно синхронизировать части" : "Повторно загрузить метаданные"}<span className="mt-1 block text-xs text-stone-500">{partsOnly ? "Обновить сезоны даже если они уже есть. Без этой галки уже заполненные записи не берутся снова." : "Обновить данные из источника, даже если они уже заполнены. Части, оценки и рецензии сохранятся."}</span></span>
          </label>
        </> : <p className="rounded-md border bg-stone-50 p-3 text-sm text-stone-600">Дополнительные параметры для этого обработчика не требуются.</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button><Button type="submit">Поставить в очередь</Button></div>
      </form>
    </div> : null}
  </>;
}
