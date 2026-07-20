import { deliverPendingAuthorEmails } from "@/lib/auth/email-outbox-delivery";
import { claimEmailAutomationJob, finishEmailAutomationJob } from "@/db/queries/email-automation";

export async function POST(request: Request) {
  const workerSecret = process.env.AUTH_EMAIL_WORKER_SECRET?.trim();
  if (!workerSecret || request.headers.get("authorization") !== `Bearer ${workerSecret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const claim = await claimEmailAutomationJob("delivery");
  if (!claim) return Response.json({ skipped: true });
  try {
    const result = await deliverPendingAuthorEmails(claim.settings);
    if (!result.ok) throw new Error(result.reason);
    await finishEmailAutomationJob({ job: "delivery", leaseUntil: claim.leaseUntil, intervalSeconds: claim.settings.deliveryIntervalSeconds, ok: true });
    return Response.json(result);
  } catch (error) {
    await finishEmailAutomationJob({ job: "delivery", leaseUntil: claim.leaseUntil, intervalSeconds: claim.settings.deliveryIntervalSeconds, ok: false, error });
    return Response.json({ error: "delivery failed" }, { status: 503 });
  }
}
