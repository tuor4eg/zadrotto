import { startExternalAuth } from "@/lib/auth/external/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  return startExternalAuth(request, (await context.params).provider);
}
