import { eq } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, emailAutomationSettings } from "@/db/schema";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";
import { EMAIL_AUTOMATION_DEFAULTS, type EmailAutomationSettingsInput } from "@/lib/auth/email-automation";

export async function getEmailAutomationSettings() {
  const [settings] = await db.select().from(emailAutomationSettings)
    .where(eq(emailAutomationSettings.id, 1)).limit(1);
  return settings ?? EMAIL_AUTOMATION_DEFAULTS;
}

export async function saveEmailAutomationSettings(input: {
  settings: EmailAutomationSettingsInput;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  return db.transaction(async (tx) => {
    await tx.insert(emailAutomationSettings).values({ id: 1, ...input.settings, updatedByAdminId: input.adminId })
      .onConflictDoUpdate({ target: emailAutomationSettings.id, set: { ...input.settings, updatedByAdminId: input.adminId, updatedAt: new Date() } });
    await tx.insert(adminActivityLogs).values({ ...input.activityLog, metadata: input.settings });
  });
}
