import { getCreatorTypes, getCreatorRoles } from "@/db/queries/creators";
import { Alert } from "@/components/ui/alert";
import { getAllMediaTypeOptions } from "@/db/queries/media-types";
import { getAdminJobs, getLatestJobRuns } from "@/db/queries/jobs";
import { getRegisteredJobHandlers } from "@/lib/jobs/queue";

import { JobsManager } from "../jobs-manager";

export default async function JobSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const [jobs, latestRuns, handlerDefinitions, mediaTypes, creatorTypes, creatorRoles] = await Promise.all([
    getAdminJobs(),
    getLatestJobRuns(),
    Promise.resolve(getRegisteredJobHandlers()),
    getAllMediaTypeOptions(),
    getCreatorTypes(),
    getCreatorRoles(),
  ]);
  const handlers = handlerDefinitions.map(({ label, schedulable, type }) => ({
    label,
    schedulable: schedulable !== false,
    type,
  }));

  return (
    <section className="space-y-6">
      {query.error ? (
        <Alert variant="destructive">
          {query.error === "enqueue" ? "Не удалось поставить разовую задачу в очередь. Проверьте параметры выбранной операции."
            : "Не удалось выполнить действие: проверьте заполненные поля и расписание."}
        </Alert>
      ) : null}
      {query.deleted === "1" ? <p role="status" className="text-sm text-stone-600">Расписание удалено. История запусков осталась в журнале.</p> : null}
      <JobsManager handlers={handlers} jobs={jobs} latestRuns={latestRuns} mediaTypes={mediaTypes} creatorTypes={creatorTypes} creatorRoles={creatorRoles} />
    </section>
  );
}
