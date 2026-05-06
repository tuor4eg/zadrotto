"use server";

import { redirect } from "next/navigation";

import { clearAdminSessionCookie } from "@/lib/admin-auth";

export async function logoutAdmin() {
  await clearAdminSessionCookie();

  redirect("/admin/login");
}
