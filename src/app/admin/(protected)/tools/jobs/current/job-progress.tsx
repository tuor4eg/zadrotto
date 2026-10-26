import type { JobProgress } from "@/lib/jobs/progress";
export function CurrentJobProgress({ progress, running }: { progress: JobProgress; running: boolean }) {
  return <div className="min-w-0 space-y-2 xl:min-w-48">
    {progress.stage ? <p className="text-xs text-stone-600">{progress.stage}</p> : null}
    <div role="progressbar" aria-label="Прогресс задачи" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent ?? undefined}
      aria-valuetext={progress.percent === null ? "Общий объём неизвестен" : `${progress.percent}%`}
      className="h-2 overflow-hidden rounded-full bg-stone-100">
      <div className={progress.percent === null ? `h-full w-1/3 rounded-full ${running ? "motion-safe:animate-pulse bg-amber-400" : "bg-stone-300"}` : "h-full rounded-full bg-emerald-600"} style={progress.percent !== null ? { width: `${progress.percent}%` } : undefined} />
    </div>
    {progress.percent !== null ? <p className="text-xs text-stone-500">{progress.percent}% · {progress.done} из {progress.total}</p> : null}
    {progress.stats.length ? <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{progress.stats.map(stat => <div key={stat.label}><dt className="inline text-stone-500">{stat.label}: </dt><dd className="inline font-medium tabular-nums">{stat.value}</dd></div>)}</dl> : <p className="text-xs text-stone-500">Задача пока не сообщает статистику.</p>}
    {progress.percent === null ? <p className="text-xs text-stone-500">Общий объём неизвестен.</p> : null}
  </div>;
}
