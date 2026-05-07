"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuthor, getAuthorById, updateAuthor } from "@/db/queries/authors";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/app-error-messages";
import { saveAuthorPermission } from "@/lib/author-permission-service";
import { isAuthorPermission } from "@/lib/author-permissions";
import { generateEntityCode } from "@/lib/generated-code";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function createAuthorAction(formData: FormData) {
  await requireAdminUser();

  const name = getFormString(formData, "name");

  if (!name) {
    redirect("/admin/authors/new?error=required");
  }

  try {
    await createAuthor({
      name,
      code: generateEntityCode({ type: "author", name }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/admin/authors/new?error=duplicate-code");
    }

    console.error(error);
    redirect(`/admin/authors/new?error=${getAdminFormErrorCode(error)}`);
  }

  revalidatePath("/admin/authors");
  redirect("/admin/authors?created=1");
}

export async function updateAuthorAction(formData: FormData) {
  await requireAdminUser();

  const authorId = Number(getFormString(formData, "authorId"));
  const name = getFormString(formData, "name");

  if (!Number.isInteger(authorId) || authorId <= 0) {
    redirect("/admin/authors?error=invalid-author");
  }

  if (!name) {
    redirect(`/admin/authors/${authorId}/edit?error=required`);
  }

  try {
    const author = await updateAuthor({
      id: authorId,
      name,
    });

    if (!author) {
      redirect("/admin/authors?error=invalid-author");
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect(`/admin/authors/${authorId}/edit?error=duplicate-code`);
    }

    console.error(error);
    redirect(`/admin/authors/${authorId}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  revalidatePath("/admin/authors");
  revalidatePath(`/admin/authors/${authorId}/edit`);
  revalidatePath("/", "layout");
  redirect(`/admin/authors/${authorId}/edit?updated=1`);
}

export async function updateAuthorPermissionAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const authorId = Number(getFormString(formData, "authorId"));
  const permission = getFormString(formData, "permission");
  const isEnabled = getFormString(formData, "enabled") === "1";
  const redirectPath =
    Number.isInteger(authorId) && authorId > 0
      ? `/admin/authors/${authorId}/edit`
      : "/admin/authors";

  if (!Number.isInteger(authorId) || authorId <= 0 || !isAuthorPermission(permission)) {
    redirect(`${redirectPath}?error=invalid-permission`);
  }

  let author;

  try {
    author = await getAuthorById(authorId);
  } catch (error) {
    console.error(error);
    redirect(`${redirectPath}?error=${getAdminFormErrorCode(error)}`);
  }

  if (!author) {
    redirect(`${redirectPath}?error=invalid-permission`);
  }

  try {
    await saveAuthorPermission({
      authorId,
      permission,
      isEnabled,
      createdByAdminId: adminUser.id,
    });
  } catch (error) {
    console.error(error);
    redirect(`${redirectPath}?error=${getAdminFormErrorCode(error)}`);
  }

  revalidatePath("/admin/authors");
  revalidatePath(redirectPath);
  redirect(`${redirectPath}?permissions=1`);
}
