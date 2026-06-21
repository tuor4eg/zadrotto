"use server";

import { redirect } from "next/navigation";

import { getAdminUserByLogin, updateAdminLastLoginAt } from "@/db/queries/admin-users";
import { setAdminSessionCookie } from "@/lib/auth/admin-auth";
import {
  ADMIN_AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  getAuthRequestIpAddress,
  normalizeAuthIdentitySubject,
} from "@/lib/auth/rate-limits";
import { getAdminFormErrorCode } from "@/lib/common/app-error-messages";
import { verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity-logs/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function loginAdmin(formData: FormData) {
  const login = getFormString(formData, "login");
  const password = getFormString(formData, "password");
  const rateLimit = await checkAuthRateLimit({
    scope: "admin",
    ipAddress: await getAuthRequestIpAddress(),
    identitySubject: normalizeAuthIdentitySubject(login),
    limits: ADMIN_AUTH_RATE_LIMITS,
  });
  let adminUser = null;

  if (!rateLimit.ok) {
    await logActivity({
      action: "admin.login.failed",
      actorType: "admin",
      status: "failure",
      message:
        rateLimit.reason === "limited"
          ? "Слишком много попыток входа."
          : "Rate limit недоступен.",
      severity: rateLimit.reason === "unavailable" ? "critical" : "warning",
      metadata: {
        login,
      },
    });
    redirect(
      `/admin/login?error=${
        rateLimit.reason === "limited" ? "rate-limit" : "rate-limit-unavailable"
      }`,
    );
  }

  try {
    adminUser = login ? await getAdminUserByLogin(login) : null;
  } catch (error) {
    console.error(error);
    redirect(`/admin/login?error=${getAdminFormErrorCode(error)}`);
  }

  const isValidPassword =
    adminUser && password ? await verifyPassword(password, adminUser.passwordHash) : false;

  if (!adminUser || !isValidPassword) {
    await logActivity({
      action: "admin.login.failed",
      actorType: "admin",
      adminUserId: adminUser?.id ?? null,
      status: "failure",
      message: "Неверный логин или пароль.",
      metadata: {
        login,
      },
    });
    redirect("/admin/login?error=invalid");
  }

  try {
    const sessionInvalidatedAt = await updateAdminLastLoginAt(adminUser.id);
    await setAdminSessionCookie(adminUser.id, sessionInvalidatedAt.getTime());
    await logActivity({
      action: "admin.login",
      actorType: "admin",
      adminUserId: adminUser.id,
      message: "Админ вошел в панель управления.",
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/login?error=${getAdminFormErrorCode(error)}`);
  }

  redirect("/admin");
}
