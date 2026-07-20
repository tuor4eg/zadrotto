import { cleanupAuthorAuthData } from "@/db/operations/author-auth";
import { claimEmailAutomationJob, finishEmailAutomationJob } from "@/db/queries/email-automation";

export async function POST(request: Request) {
  const workerSecret = process.env.AUTH_EMAIL_WORKER_SECRET?.trim();
  if (!workerSecret || request.headers.get("authorization") !== `Bearer ${workerSecret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const claim = await claimEmailAutomationJob("cleanup");
  if (!claim) return Response.json({ skipped: true });
  try {
    const result = await cleanupAuthorAuthData(claim.settings);
    await finishEmailAutomationJob({ job: "cleanup", leaseUntil: claim.leaseUntil, intervalSeconds: claim.settings.cleanupIntervalSeconds, ok: true });
    return Response.json(result);
  } catch (error) {
    await finishEmailAutomationJob({ job: "cleanup", leaseUntil: claim.leaseUntil, intervalSeconds: claim.settings.cleanupIntervalSeconds, ok: false, error });
    return Response.json({ error: "cleanup failed" }, { status: 503 });
  }
}
