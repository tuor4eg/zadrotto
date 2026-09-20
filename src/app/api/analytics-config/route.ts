import { getGoogleAnalyticsId } from "@/lib/analytics/google-analytics";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { measurementId: getGoogleAnalyticsId() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
