"use server";

import { logActivity } from "@/lib/activity-logs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthor } from "@/lib/auth/author-auth";
import { canManageFranchises } from "@/lib/franchises/access";
import { getAdminFranchiseById, updateFranchise } from "@/db/queries/franchises";
import { normalizeOptionalFranchiseString } from "@/lib/forms/admin-franchise";

export async function updateTrustedFranchiseAction(formData: FormData) {
  const author = await requireAuthor();
  if (!canManageFranchises(author)) throw new Error("franchise-forbidden");
  const id = Number(formData.get("franchiseId"));
  const title = String(formData.get("title") ?? "").trim();
  const parentValue = String(formData.get("parentId") ?? "");
  const parentId = parentValue ? Number(parentValue) : null;
  if (!Number.isSafeInteger(id) || id < 1 || !title || (parentId !== null && (!Number.isSafeInteger(parentId) || parentId < 1))) throw new Error("invalid-franchise");
  const item = await getAdminFranchiseById(id);
  if (!item || item.publicationStatus !== "published") throw new Error("invalid-franchise");
  const originalTitle = normalizeOptionalFranchiseString(String(formData.get("originalTitle") ?? ""));
  const description = normalizeOptionalFranchiseString(String(formData.get("description") ?? ""));
  try {
    await updateFranchise({ actorAuthorId: author.id, id, title, originalTitle, description, parentId });
  } catch {
    redirect(`/author/series/${id}/edit?error=save`);
  }
  await logActivity({ action: "franchise.updated", actorType: "author", authorId: author.id, entityType: "franchise", entityId: id, entityLabel: title });
  revalidatePath("/", "layout");
  redirect(`/author/series/${id}/edit?updated=1`);
}
