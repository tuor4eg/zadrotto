import { eq } from "drizzle-orm";

import { db } from "@/db";
import { toastSettings } from "@/db/schema";

const TOAST_SETTINGS_ID = 1;
export const DEFAULT_TOAST_DURATION_SECONDS = 5;
export const MIN_TOAST_DURATION_SECONDS = 1;
export const MAX_TOAST_DURATION_SECONDS = 60;

export type ToastSettingsValue = {
  siteDurationSeconds: number;
  adminDurationSeconds: number;
};

export async function getToastSettings(): Promise<ToastSettingsValue> {
  const [settings] = await db
    .select({
      siteDurationSeconds: toastSettings.siteDurationSeconds,
      adminDurationSeconds: toastSettings.adminDurationSeconds,
    })
    .from(toastSettings)
    .where(eq(toastSettings.id, TOAST_SETTINGS_ID))
    .limit(1);

  return {
    siteDurationSeconds: settings?.siteDurationSeconds ?? DEFAULT_TOAST_DURATION_SECONDS,
    adminDurationSeconds: settings?.adminDurationSeconds ?? DEFAULT_TOAST_DURATION_SECONDS,
  };
}

export async function saveToastSettings(input: ToastSettingsValue & { updatedByAdminId: number }) {
  const [settings] = await db
    .insert(toastSettings)
    .values({ id: TOAST_SETTINGS_ID, ...input })
    .onConflictDoUpdate({
      target: toastSettings.id,
      set: { ...input, updatedAt: new Date() },
    })
    .returning({
      siteDurationSeconds: toastSettings.siteDurationSeconds,
      adminDurationSeconds: toastSettings.adminDurationSeconds,
    });

  return settings;
}
