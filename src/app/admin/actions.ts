"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";

import { clearAdminSessionCookie, revokeCurrentAdminSession } from "@/lib/admin-auth";

export async function logoutAdmin() {
  await revokeCurrentAdminSession();
  await clearAdminSessionCookie();

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/login");

  redirect("/admin/login", RedirectType.replace);
}
