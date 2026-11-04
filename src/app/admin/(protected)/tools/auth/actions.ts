"use server";

import { logActivity } from "@/lib/activity-logs/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { EXTERNAL_AUTH_PROVIDER_DEFINITIONS } from "@/lib/auth/external/provider-definitions";
import { saveAuthProviderSettings } from "@/db/queries/auth-provider-settings";

export async function saveAuthProviderAction(_previous: { error: string | null; success: string | null }, formData: FormData): Promise<{ error: string | null; success: string | null }> {
  const admin = await requireAdminUser();
  try {
    const code = String(formData.get("providerCode") ?? "");
    const provider = EXTERNAL_AUTH_PROVIDER_DEFINITIONS.find((entry) => entry.code === code);
    if (!provider) return { error: "Неизвестный провайдер.", success: null };
    const result = await saveAuthProviderSettings({
      adminId: admin.id,
      providerCode: code,
      clientId: String(formData.get("credential:clientId") ?? ""),
      clientSecret: String(formData.get("credential:clientSecret") ?? ""),
      enabled: formData.get("enabled") === "on",
    });
    if (result.error) return { error: result.error, success: null };
    await logActivity({
      action: "auth-provider-settings.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityLabel: provider.name,
      message: "Настройки провайдера входа изменены.",
      metadata: { providerCode: code, enabled: formData.get("enabled") === "on" },
    });
    revalidatePath("/admin/tools/auth");
    return { error: null, success: "Настройки входа сохранены." };
  } catch {
    return { error: "Не удалось сохранить настройки входа. Попробуйте ещё раз.", success: null };
  }
}
