"use server";

import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { CREATOR_FIELDS_FILL_JOB_TYPE, CREATOR_FIELDS_FILL_PROVIDERS, CREATOR_FILL_FIELDS } from "@/lib/creators/fields-fill-payload";
import { enqueueJobRun } from "@/lib/jobs/queue";

const SNAPSHOTS_PATH = "/admin/tools/providers/snapshots";

export async function enqueueCreatorFieldsFillAction(creatorId: number | null, form: FormData) {
  const admin = await requireAdminUser();
  if (creatorId !== null && (!Number.isSafeInteger(creatorId) || creatorId < 1)) {
    redirect(`${SNAPSHOTS_PATH}?fillError=invalid`);
  }
  const single = creatorId !== null;
  const path = single ? `/admin/creators/${creatorId}/edit` : SNAPSHOTS_PATH;
  const ids = single ? "" : String(form.get("creatorIds") ?? "").trim();
  const providers = form.getAll("providers");
  const allProviders = CREATOR_FIELDS_FILL_PROVIDERS.every(provider => providers.includes(provider)) &&
    providers.length === CREATOR_FIELDS_FILL_PROVIDERS.length;
  let runId: number;
  try {
    const run = await enqueueJobRun({
      type: CREATOR_FIELDS_FILL_JOB_TYPE,
      payload: {
        ...(single ? { creatorIds: [creatorId] } : ids ? {
          creatorIds: ids.split(",").map(value => {
            const id = value.trim();
            return /^\d+$/.test(id) ? Number(id) : NaN;
          }),
        } : {}),
        ...(!single && !allProviders ? { providers } : {}),
        fields: single ? [...CREATOR_FILL_FIELDS] : form.getAll("fields").flatMap(field =>
          field === "birthOrFoundedDate" ? ["birthDate", "foundedDate"] : [field]),
        fetchMissing: single || form.get("fetchMissing") === "on",
        force: single,
        ...(single ? {} : {
          ...(form.get("batchSize") ? { batchSize: Number(form.get("batchSize")) } : {}),
          ...(form.get("batchPauseHours") ? { batchPauseHours: Number(form.get("batchPauseHours")) } : {}),
        }),
      },
      source: "manual",
      createdByAdminId: admin.id,
    });
    runId = run.id;
  } catch {
    redirect(`${path}?fillError=invalid`);
  }
  redirect(`${path}?fillRun=${runId}`);
}
