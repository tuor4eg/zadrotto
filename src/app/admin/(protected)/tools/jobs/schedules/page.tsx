import { Alert } from "@/components/ui/alert";
import { getAdminJobs, getLatestJobRuns } from "@/db/queries/jobs";
import { getRegisteredJobHandlers } from "@/lib/jobs/queue";

import { JobsManager } from "../jobs-manager";

export default async function JobSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const [jobs, latestRuns, handlerDefinitions] = await Promise.all([
    getAdminJobs(),
    getLatestJobRuns(),
    Promise.resolve(getRegisteredJobHandlers()),
  ]);
  const handlers = handlerDefinitions.map(({ label, type }) => ({ label, type }));

  return (
    <section className="space-y-6">
      {query.error ? (
        <Alert variant="destructive">
          Не удалось выполнить действие: проверьте заполненные поля и расписание.
        </Alert>
      ) : null}
      <JobsManager handlers={handlers} jobs={jobs} latestRuns={latestRuns} />
    </section>
  );
}
