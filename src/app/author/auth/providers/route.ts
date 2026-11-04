import { getAvailableExternalProviders } from "@/lib/auth/external/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getAvailableExternalProviders(), { headers: { "Cache-Control": "no-store" } });
}
