import { cleanupAuthorAuthData } from "@/db/operations/author-auth";

export async function POST(request: Request) {
  const workerSecret = process.env.AUTH_EMAIL_WORKER_SECRET?.trim();
  if (!workerSecret || request.headers.get("authorization") !== `Bearer ${workerSecret}`) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return Response.json(await cleanupAuthorAuthData());
}
