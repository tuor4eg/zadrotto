"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";

import { clearAdminSessionCookie, revokeCurrentAdminSession } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";

export async function logoutAdmin() {
  const adminUserId = await revokeCurrentAdminSession();
  if (adminUserId) {
    await logActivity({
      action: "admin.logout",
      actorType: "admin",
      adminUserId,
      message: "Админ вышел из панели управления.",
    });
  }
  await clearAdminSessionCookie();

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/login");

  redirect("/admin/login", RedirectType.replace);
}
