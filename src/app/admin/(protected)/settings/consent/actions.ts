"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { revokePersonalDataConsent, savePersonalDataConsentSettings } from "@/db/queries/personal-data-consent";

export async function saveConsentSettingsAction(formData: FormData) {
  await requireAdminUser();
  const operatorDetails = String(formData.get("operatorDetails") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  if (operatorDetails.length > 10000 || contact.length > 2000) redirect("/admin/settings/consent?error=length");
  await savePersonalDataConsentSettings({ requireConsent: formData.get("requireConsent") === "on", operatorDetails, contact });
  revalidatePath("/", "layout");
  revalidatePath("/consent");
  revalidatePath("/admin/settings/consent");
  redirect("/admin/settings/consent?updated=1");
}

export async function revokeConsentAction(formData: FormData) {
  await requireAdminUser();
  const rawId = String(formData.get("authorId") ?? "");
  const authorId = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(authorId) || authorId < 1 || authorId > 2147483647 || formData.get("confirmed") !== "on") redirect("/admin/settings/consent?error=revoke");
  await revokePersonalDataConsent(authorId);
  revalidatePath("/", "layout");
  redirect("/admin/settings/consent?revoked=1");
}
