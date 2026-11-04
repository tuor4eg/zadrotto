import { finishExternalAuth } from "@/lib/auth/external/http";

export const runtime = "nodejs";

async function callback(request: Request, context: { params: Promise<{ provider: string }> }) {
  return finishExternalAuth(request, (await context.params).provider);
}

export { callback as GET, callback as POST };
