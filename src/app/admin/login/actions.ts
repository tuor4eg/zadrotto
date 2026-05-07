"use server";

import { redirect } from "next/navigation";

import { getAdminUserByLogin, updateAdminLastLoginAt } from "@/db/queries/admin-users";
import { setAdminSessionCookie } from "@/lib/admin-auth";
import { getAdminFormErrorCode } from "@/lib/app-error-messages";
import { verifyPassword } from "@/lib/password";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function loginAdmin(formData: FormData) {
  const login = getFormString(formData, "login");
  const password = getFormString(formData, "password");
  let adminUser = null;

  try {
    adminUser = login ? await getAdminUserByLogin(login) : null;
  } catch (error) {
    console.error(error);
    redirect(`/admin/login?error=${getAdminFormErrorCode(error)}`);
  }

  const isValidPassword =
    adminUser && password ? await verifyPassword(password, adminUser.passwordHash) : false;

  if (!adminUser || !isValidPassword) {
    redirect("/admin/login?error=invalid");
  }

  try {
    await updateAdminLastLoginAt(adminUser.id);
  } catch (error) {
    console.error(error);
    redirect(`/admin/login?error=${getAdminFormErrorCode(error)}`);
  }

  await setAdminSessionCookie(adminUser.id);

  redirect("/admin");
}
