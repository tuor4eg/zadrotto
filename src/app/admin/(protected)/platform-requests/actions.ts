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

export async function resolvePlatformAssetRequestAction(formData: FormData) {
  const admin = await requireAdminUser();
  const requestId = parsePlatformId(formData.get("requestId"));
  if (!requestId) redirect("/admin/platform-requests?error=invalid");
  const decision = formData.get("decision");
  if (decision !== "map" && decision !== "exclude") redirect(`/admin/platform-requests/${requestId}?error=invalid`);
  const candidateKey = formData.get("candidateKey");
  try {
    await resolvePlatformRequest({requestId,adminId:admin.id,decision,
      candidateKey:typeof candidateKey==="string"?candidateKey:undefined});
  } catch(error) {
    console.error("Не удалось принять решение по изображению платформы.",error);
    redirect(`/admin/platform-requests/${requestId}?error=changed`);
  }
  revalidatePath("/admin/platforms");
  revalidatePath("/platforms");
  revalidatePath("/admin/platform-requests");
  redirect(`/admin/platform-requests/${requestId}?saved=1`);
}

export async function reopenPlatformAssetRequestAction(formData: FormData) {
  const admin = await requireAdminUser();
  const requestId = parsePlatformId(formData.get("requestId"));
  if (!requestId) redirect("/admin/platform-requests?error=invalid");
  const {reopenPlatformAssetRequest}=await import("@/db/queries/platform-logo-requests");
  try {await reopenPlatformAssetRequest({requestId,adminId:admin.id});}
  catch {redirect(`/admin/platform-requests/${requestId}?error=changed`);}
  revalidatePath("/platforms");
  revalidatePath("/admin/platforms");
  redirect(`/admin/platform-requests/${requestId}?reopened=1`);
}
