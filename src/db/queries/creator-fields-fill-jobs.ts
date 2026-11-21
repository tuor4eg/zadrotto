import { CREATOR_FIELDS_FILL_JOB_TYPE, CREATOR_FILL_FIELDS } from "@/lib/creators/fields-fill-payload";
import type { DbTransaction } from "@/db/transaction";
import { createJobRun } from "./jobs";

/** Called only after a confirmed binding change, in its transaction. */
export async function enqueueCreatorFieldsFillForBinding(tx: DbTransaction, creatorId: number) {
  await createJobRun({
    type: CREATOR_FIELDS_FILL_JOB_TYPE,
    payload: { creatorIds: [creatorId], fields: CREATOR_FILL_FIELDS, fetchMissing: true, force: false },
    source: "event",
    maxAttempts: 3,
    timeoutSeconds: 900,
    retryBaseSeconds: 60,
    retryMaxSeconds: 3600,
  }, new Date(), tx);
}
