import { getAnalyticsSettings } from "@/db/queries/analytics-settings";
import { getGoogleAnalyticsId } from "@/lib/analytics/google-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const { enabled } = await getAnalyticsSettings();
  return Response.json(
    { enabled, measurementId: enabled ? getGoogleAnalyticsId() : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
