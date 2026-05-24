"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthorAccessProfileById } from "@/db/queries/author-access-profiles";
import {
  blockAuthor,
  createAuthor,
  deleteAuthorIfUnused,
  getAuthorById,
  unblockAuthor,
  updateAuthor,
} from "@/db/queries/authors";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/app-error-messages";
import { canAssignAuthorAccessProfile } from "@/lib/author-access-profiles";
import { generateEntityCode } from "@/lib/generated-code";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormNumber(formData: FormData, key: string) {
  const value = Number(getFormString(formData, key));

  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function createAuthorAction(formData: FormData) {
  await requireAdminUser();

  const name = getFormString(formData, "name");
  const accessProfileId = getFormNumber(formData, "accessProfileId");

  if (!name || !accessProfileId) {
    redirect("/admin/authors/new?error=required");
  }

  let accessProfile;

  try {
    accessProfile = await getAuthorAccessProfileById(accessProfileId);
  } catch (error) {
    console.error(error);
    redirect(`/admin/authors/new?error=${getAdminFormErrorCode(error)}`);
  }

  if (!accessProfile || !canAssignAuthorAccessProfile(accessProfile)) {
    redirect("/admin/authors/new?error=invalid-profile");
  }

  try {
    await createAuthor({
      name,
      code: generateEntityCode({ type: "author", name }),
      accessProfileId,
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

  const authorId = getFormNumber(formData, "authorId");
  const name = getFormString(formData, "name");
  const accessProfileId = getFormNumber(formData, "accessProfileId");

  if (!authorId) {
    redirect("/admin/authors?error=invalid-author");
  }

  if (!name || !accessProfileId) {
    redirect(`/admin/authors/${authorId}/edit?error=required`);
  }

  let author;
  let accessProfile;

  try {
    accessProfile = await getAuthorAccessProfileById(accessProfileId);
  } catch (error) {
    console.error(error);
    redirect(`/admin/authors/${authorId}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!accessProfile || !canAssignAuthorAccessProfile(accessProfile)) {
    redirect(`/admin/authors/${authorId}/edit?error=invalid-profile`);
  }

  try {
    author = await updateAuthor({
      id: authorId,
      name,
      accessProfileId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect(`/admin/authors/${authorId}/edit?error=duplicate-code`);
    }

    console.error(error);
    redirect(`/admin/authors/${authorId}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!author) {
    redirect("/admin/authors?error=invalid-author");
  }

  revalidatePath("/admin/authors");
  revalidatePath(`/admin/authors/${authorId}/edit`);
  revalidatePath("/", "layout");
  redirect(`/admin/authors/${authorId}/edit?updated=1`);
}

export async function blockAuthorAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const authorId = getFormNumber(formData, "authorId");

  if (!authorId) {
    redirect("/admin/authors?error=invalid-author");
  }

  const existingAuthor = await getAuthorById(authorId);

  if (!existingAuthor) {
    redirect("/admin/authors?error=invalid-author");
  }

  if (existingAuthor.isSystem) {
    redirect("/admin/authors?error=system-author");
  }

  let author;

  try {
    author = await blockAuthor({
      id: authorId,
      blockedByAdminId: adminUser.id,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/authors?error=${getAdminFormErrorCode(error)}`);
  }

  if (!author) {
    redirect("/admin/authors?error=invalid-author");
  }

  revalidatePath("/admin/authors");
  revalidatePath(`/admin/authors/${authorId}/edit`);
  redirect("/admin/authors?updated=blocked");
}

export async function unblockAuthorAction(formData: FormData) {
  await requireAdminUser();

  const authorId = getFormNumber(formData, "authorId");

  if (!authorId) {
    redirect("/admin/authors?error=invalid-author");
  }

  let author;

  try {
    author = await unblockAuthor(authorId);
  } catch (error) {
    console.error(error);
    redirect(`/admin/authors?error=${getAdminFormErrorCode(error)}`);
  }

  if (!author) {
    redirect("/admin/authors?error=invalid-author");
  }

  revalidatePath("/admin/authors");
  revalidatePath(`/admin/authors/${authorId}/edit`);
  redirect("/admin/authors?updated=unblocked");
}

export async function deleteAuthorAction(formData: FormData) {
  await requireAdminUser();

  const authorId = getFormNumber(formData, "authorId");

  if (!authorId) {
    redirect("/admin/authors?error=invalid-author");
  }

  const author = await getAuthorById(authorId);

  if (!author) {
    redirect("/admin/authors?error=invalid-author");
  }

  let deleteResult;

  try {
    deleteResult = await deleteAuthorIfUnused(authorId);
  } catch (error) {
    console.error(error);
    redirect(`/admin/authors?error=${getAdminFormErrorCode(error)}`);
  }

  if (deleteResult === "not-found") {
    redirect("/admin/authors?error=invalid-author");
  }

  if (deleteResult === "has-data") {
    redirect("/admin/authors?error=author-has-data");
  }

  if (deleteResult === "last-system-author") {
    redirect("/admin/authors?error=last-system-author");
  }

  revalidatePath("/admin/authors");
  redirect("/admin/authors?updated=deleted");
}
