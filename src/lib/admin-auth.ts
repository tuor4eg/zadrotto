import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminUserById, revokeAdminSessions } from "@/db/queries/admin-users";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { shouldUseSecureCookies } from "@/lib/cookies";

export async function getCurrentAdminUser() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifyAdminSessionToken(token);

  if (!payload || payload.type !== "admin") {
    return null;
  }

  const adminUser = await getAdminUserById(payload.adminId);

  if (!adminUser || adminUser.updatedAt.getTime() !== payload.sessionUpdatedAt) {
    return null;
  }

  return adminUser;
}

export async function requireAdminUser() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login");
  }

  return adminUser;
}

export async function setAdminSessionCookie(adminId: number, sessionUpdatedAt: number) {
  const token = createAdminSessionToken(adminId, sessionUpdatedAt);

  (await cookies()).set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function revokeCurrentAdminSession() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const payload = token ? verifyAdminSessionToken(token) : null;

  if (payload?.type === "admin") {
    await revokeAdminSessions(payload.adminId);
  }
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/admin",
    maxAge: 0,
    expires: new Date(0),
  });
}
