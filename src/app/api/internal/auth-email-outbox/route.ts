import { deliverPendingAuthorEmails } from "@/lib/auth/email-outbox-delivery";

export async function POST(request: Request) {
  const workerSecret = process.env.AUTH_EMAIL_WORKER_SECRET?.trim();
  if (!workerSecret || request.headers.get("authorization") !== `Bearer ${workerSecret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await deliverPendingAuthorEmails();
  return result.ok
    ? Response.json(result)
    : Response.json({ error: result.reason }, { status: 503 });
}
