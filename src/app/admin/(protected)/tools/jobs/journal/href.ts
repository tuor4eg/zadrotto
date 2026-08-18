export function buildJobJournalHref(input: {
  job?: string
  page?: number
  pageSize?: number
}) {
  const params = new URLSearchParams()
  if (input.job && input.job !== "all") params.set("job", input.job)
  if (input.page && input.page > 1) params.set("page", String(input.page))
  if (input.pageSize && input.pageSize !== 25) params.set("pageSize", String(input.pageSize))
  const query = params.toString()
  return query ? `/admin/tools/jobs/journal?${query}` : "/admin/tools/jobs/journal"
}
