"use server";

import { parseAdminTagStatus } from "@/lib/tags/model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAdminTag, getAdminTagById, renameAdminTag } from "@/db/queries/tags";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { changeMediaTagAction } from "../media/[id]/edit/media-tag-actions";
import { parsePage } from "@/lib/common/pagination";

export async function deleteTagAction(form: FormData) {
  await requireAdminUser();
  const params = new URLSearchParams();
  const status = parseAdminTagStatus(form.get("status"));
  if (status !== "all") params.set("status", status);
  const query = String(form.get("q") ?? "").trim();
  if (query) params.set("q", query);
  params.set("page", String(parsePage(String(form.get("page") ?? "1"))));
  try {
    await deleteAdminTag(Number(form.get("tagId")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    params.set("error", message === "system-tag" ? "system" : message === "tag-dependencies" ? "dependencies" : "delete");
    redirect(`/admin/tags?${params}`);
  }
  revalidatePath("/admin/tags");
  revalidatePath("/", "layout");
  redirect(`/admin/tags?${params}`);
}

function tagEditHref(tagId: number, page: number, status: string) {
  const params = new URLSearchParams({ page: String(page), result: status });
  return `/admin/tags/${tagId}/edit?${params}`;
}

function validId(id: number) {
  return Number.isInteger(id) && id > 0 && id <= 2147483647;
}

export async function renameTagAction(tagId: number, page: number, form: FormData) {
  const admin = await requireAdminUser();
  if (!validId(tagId)) redirect("/admin/tags");
  const title = form.get("title");
  if (typeof title !== "string") redirect(tagEditHref(tagId, page, "invalid"));
  try {
    const result = await renameAdminTag(tagId, title);
    if (result) {
      await logActivity({
        action: "tag.renamed",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "tag",
        entityId: tagId,
        entityLabel: result.title,
        metadata: { tagId, previousTitle: result.previousTitle },
      });
      revalidatePath("/admin/tags");
      revalidatePath(`/admin/tags/${tagId}/edit`);
      revalidatePath("/admin/media/[id]/edit", "page");
      revalidatePath("/media/[code]", "page");
      revalidatePath("/archive");
      revalidatePath("/tags");
      revalidatePath("/achievements");
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    redirect(tagEditHref(tagId, page, code === "tag-title-taken" ? "duplicate" : code === "invalid-tag" ? "invalid" : "error"));
  }
  redirect(tagEditHref(tagId, page, "renamed"));
}

export async function toggleTagForEntryAction(tagId: number, page: number, form: FormData) {
  const mediaItemId = Number(form.get("mediaItemId"));
  const operation = form.get("operation");
  if (!validId(tagId) || !validId(mediaItemId) || (operation !== "pin" && operation !== "unpin")) {
    await requireAdminUser();
    redirect("/admin/tags");
  }
  const input = new FormData();
  input.set("operation", operation);
  input.set("tagId", String(tagId));
  const result = await changeMediaTagAction(mediaItemId, input);
  if (!result.error && !(await getAdminTagById(tagId))) redirect("/admin/tags");
  redirect(tagEditHref(tagId, page, result.error ? "error" : "updated"));
}

export async function attachTagToEntryAction(tagId: number, form: FormData) {
  const mediaItemId = Number(form.get("mediaItemId"));
  const input = new FormData();
  input.set("operation", "attach");
  input.set("tagId", String(tagId));
  return changeMediaTagAction(mediaItemId, input);
}
