"use server";

import { parseAdminTagStatus } from "@/lib/tags/model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAdminTag } from "@/db/queries/tags";
import { requireAdminUser } from "@/lib/auth/admin-auth";
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
