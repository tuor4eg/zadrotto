"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolvePlatformRequest, retryPlatformRequest } from "@/db/queries/platform-requests";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePlatformRequestDecision } from "@/lib/media/platform-request-form";
import { parsePlatformId } from "@/lib/media/admin-platforms";

function invalidatePlatformViews() {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/platforms");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/reviews/[id]", "page");
  revalidatePath("/admin/media/[id]/edit", "page");
  revalidatePath("/author/media/[id]/edit", "page");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
  revalidatePath("/api/admin/media-browser");
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "save";
}

export async function resolvePlatformRequestAction(formData: FormData) {
  const admin = await requireAdminUser();
  const requestId = parsePlatformId(formData.get("requestId"));
  if (!requestId) redirect("/admin/platform-requests?error=invalid");
  const input = parsePlatformRequestDecision(formData);
  if (!input) redirect(`/admin/platform-requests/${requestId}?error=invalid`);
  try {
    await resolvePlatformRequest({ ...input, adminId: admin.id });
  } catch (error) {
    console.error("Не удалось принять решение по платформау.", error);
    redirect(`/admin/platform-requests/${requestId}?error=${encodeURIComponent(errorCode(error))}`);
  }
  invalidatePlatformViews();
  redirect(`/admin/platform-requests/${requestId}?saved=1`);
}

export async function retryPlatformRequestAction(formData: FormData) {
  const admin = await requireAdminUser();
  const requestId = parsePlatformId(formData.get("requestId"));
  if (!requestId) redirect("/admin/platform-requests?error=invalid");
  try {
    await retryPlatformRequest({ requestId, adminId: admin.id });
  } catch (error) {
    console.error("Не удалось повторить применение платформы.", error);
    redirect(`/admin/platform-requests/${requestId}?error=${encodeURIComponent(errorCode(error))}`);
  }
  invalidatePlatformViews();
  redirect(`/admin/platform-requests/${requestId}?retried=1`);
}
