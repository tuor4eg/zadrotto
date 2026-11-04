import { eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSettings } from "@/db/schema";

export async function getAnalyticsSettings() {
  const [settings] = await db.select({ enabled: analyticsSettings.enabled }).from(analyticsSettings).where(eq(analyticsSettings.id, 1));
  return settings ?? { enabled: false };
}

export async function saveAnalyticsSettings(enabled: boolean) {
  await db.insert(analyticsSettings).values({ id: 1, enabled }).onConflictDoUpdate({ target: analyticsSettings.id, set: { enabled } });
}
