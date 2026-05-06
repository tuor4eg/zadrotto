"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuthor, getAuthorById } from "@/db/queries/authors";
import { requireAdminUser } from "@/lib/admin-auth";
import { saveAuthorPermission } from "@/lib/author-permission-service";
import { isAuthorPermission } from "@/lib/author-permissions";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function createAuthorAction(formData: FormData) {
  await requireAdminUser();

  const name = getFormString(formData, "name");
  const code = getFormString(formData, "code");

  if (!name || !code) {
    redirect("/admin/authors?error=required");
  }

  try {
    await createAuthor(name, code);
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/admin/authors?error=duplicate-code");
    }

    throw error;
  }

  revalidatePath("/admin/authors");
  redirect("/admin/authors?created=1");
}

export async function updateAuthorPermissionAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const authorId = Number(getFormString(formData, "authorId"));
  const permission = getFormString(formData, "permission");
  const isEnabled = getFormString(formData, "enabled") === "1";

  if (!Number.isInteger(authorId) || authorId <= 0 || !isAuthorPermission(permission)) {
    redirect("/admin/authors?error=invalid-permission");
  }

  const author = await getAuthorById(authorId);

  if (!author) {
    redirect("/admin/authors?error=invalid-permission");
  }

  await saveAuthorPermission({
    authorId,
    permission,
    isEnabled,
    createdByAdminId: adminUser.id,
  });

  revalidatePath("/admin/authors");
  redirect("/admin/authors?updated=1");
}
