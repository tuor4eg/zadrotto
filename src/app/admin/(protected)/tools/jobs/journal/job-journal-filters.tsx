"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { Select } from "@/components/ui/form"
import { buildJobJournalHref } from "./href"

export function JobJournalFilters({
  type,
  jobFilter,
  jobs,
  pageSize,
}: {
  type?: string
  jobFilter: string
  jobs: Array<{ code: string; id: number }>
  pageSize: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function replaceFilters(next: { job?: string; pageSize?: number }) {
    startTransition(() => {
      router.replace(
        buildJobJournalHref({
          type: next.job === undefined ? type : undefined,
          job: next.job ?? jobFilter,
          pageSize: next.pageSize ?? pageSize,
        }),
        { scroll: false },
      )
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 max-w-full gap-2 text-sm font-medium text-stone-700">
        История
        <Select
          aria-label="Фильтр журнала запусков"
          value={jobFilter}
          onChange={(event) => replaceFilters({ job: event.currentTarget.value })}
        >
          <option value="all">Все запуски</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>{job.code}</option>
          ))}
          <option value="adhoc">Без расписания</option>
        </Select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-stone-700">
        На странице
        <Select
          aria-label="Размер страницы журнала запусков"
          value={String(pageSize)}
          onChange={(event) => replaceFilters({ pageSize: Number(event.currentTarget.value) })}
        >
          {[25, 50, 100].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </Select>
      </label>
    </div>
  )
}
