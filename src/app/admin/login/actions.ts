"use server";

import { redirect } from "next/navigation";

import { getAdminUserByLogin, updateAdminLastLoginAt } from "@/db/queries/admin-users";
import { setAdminSessionCookie } from "@/lib/admin-auth";
import { verifyPassword } from "@/lib/password";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function loginAdmin(formData: FormData) {
  const login = getFormString(formData, "login");
  const password = getFormString(formData, "password");
  const adminUser = login ? await getAdminUserByLogin(login) : null;
  const isValidPassword =
    adminUser && password ? await verifyPassword(password, adminUser.passwordHash) : false;

  if (!adminUser || !isValidPassword) {
    redirect("/admin/login?error=invalid");
  }

  await updateAdminLastLoginAt(adminUser.id);
  await setAdminSessionCookie(adminUser.id);

  redirect("/admin");
}
