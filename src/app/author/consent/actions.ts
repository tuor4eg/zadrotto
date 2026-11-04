"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptPersonalDataConsent, hasRequiredPersonalDataConsent, isPersonalDataConsentRequired } from "@/db/queries/personal-data-consent";
import { clearAuthorSessionCookie, getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { isCurrentConsentSubmission } from "@/lib/privacy/consent";

export async function getPersonalDataConsentRequirement() {
  return isPersonalDataConsentRequired();
}

export async function needsPersonalDataConsent() {
  const current = await getCurrentAuthorSession();
  return current ? !(await hasRequiredPersonalDataConsent(current.author.id)) : false;
}

export async function acceptConsentAction(_state: string | null, formData: FormData) {
  const current = await getCurrentAuthorSession();
  if (!current) redirect("/author/login");
  if (!(await isPersonalDataConsentRequired())) redirect("/author");
  const version = formData.get("version");
  if (!isCurrentConsentSubmission(version, formData.get("accepted"))) {
    return "Подтвердите согласие с актуальной версией документа. Если страница устарела, обновите её.";
  }
  if (!(await acceptPersonalDataConsent(current.author.id, String(version)))) {
    return "Версия согласия изменилась. Обновите страницу и ознакомьтесь с документом заново.";
  }
  revalidatePath("/", "layout");
  redirect("/author");
}

export async function refuseConsentAction() {
  if (!(await isPersonalDataConsentRequired())) redirect("/author");
  await clearAuthorSessionCookie();
  redirect("/");
}
