"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAuthorAccessProfile,
  deleteAuthorAccessProfileIfUnused,
  updateAuthorAccessProfile,
} from "@/db/queries/author-access-profiles";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parseAuthorAccessProfileFormInput } from "@/lib/forms/author-access-profile";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/common/app-error-messages";
import { generateEntityCode } from "@/lib/common/generated-code";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormNumber(formData: FormData, key: string) {
  const value = Number(getFormString(formData, key));

  return Number.isInteger(value) && value > 0 ? value : null;
}

function getProfileInput(formData: FormData) {
  return parseAuthorAccessProfileFormInput({
    name: getFormString(formData, "name"),
    canPublishMediaWithoutReview: getFormString(formData, "canPublishMediaWithoutReview"),
    canPublishFranchisesWithoutReview: getFormString(formData, "canPublishFranchisesWithoutReview"),
    maxDraftMediaItems: getFormString(formData, "maxDraftMediaItems"),
    maxDraftMediaItemsPerDay: getFormString(formData, "maxDraftMediaItemsPerDay"),
    maxUploadMegabytes: getFormString(formData, "maxUploadMegabytes"),
    maxFilesPerMediaItem: getFormString(formData, "maxFilesPerMediaItem"),
    coverSearchesPerMinute: getFormString(formData, "coverSearchesPerMinute"),
    coverSearchesPerHour: getFormString(formData, "coverSearchesPerHour"),
    coverSearchesPerDay: getFormString(formData, "coverSearchesPerDay"),
  });
}

function revalidateAuthorProfileSurfaces() {
  revalidatePath("/admin/access-profiles");
  revalidatePath("/admin/authors");
  revalidatePath("/author", "layout");
}

export async function createAuthorAccessProfileAction(formData: FormData) {
  await requireAdminUser();

  const input = getProfileInput(formData);

  if (!input.ok) {
    redirect(`/admin/access-profiles/new?error=${input.error}`);
  }

  try {
    await createAuthorAccessProfile({
      ...input.value,
      code: generateEntityCode({ type: "profile", name: input.value.name }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/admin/access-profiles/new?error=duplicate-code");
    }

    console.error(error);
    redirect(`/admin/access-profiles/new?error=${getAdminFormErrorCode(error)}`);
  }

  revalidateAuthorProfileSurfaces();
  redirect("/admin/access-profiles?created=1");
}

export async function updateAuthorAccessProfileAction(formData: FormData) {
  await requireAdminUser();

  const profileId = getFormNumber(formData, "profileId");
  const input = getProfileInput(formData);

  if (!profileId) {
    redirect("/admin/access-profiles?error=invalid-profile");
  }

  if (!input.ok) {
    redirect(`/admin/access-profiles/${profileId}/edit?error=${input.error}`);
  }

  let profile;

  try {
    profile = await updateAuthorAccessProfile({
      id: profileId,
      ...input.value,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect(`/admin/access-profiles/${profileId}/edit?error=duplicate-code`);
    }

    console.error(error);
    redirect(`/admin/access-profiles/${profileId}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!profile) {
    redirect("/admin/access-profiles?error=invalid-profile");
  }

  revalidateAuthorProfileSurfaces();
  revalidatePath(`/admin/access-profiles/${profileId}/edit`);
  redirect(`/admin/access-profiles/${profileId}/edit?updated=1`);
}

export async function deleteAuthorAccessProfileAction(formData: FormData) {
  await requireAdminUser();

  const profileId = getFormNumber(formData, "profileId");

  if (!profileId) {
    redirect("/admin/access-profiles?error=invalid-profile");
  }

  let deleteResult;

  try {
    deleteResult = await deleteAuthorAccessProfileIfUnused(profileId);
  } catch (error) {
    console.error(error);
    redirect(`/admin/access-profiles?error=${getAdminFormErrorCode(error)}`);
  }

  if (deleteResult === "not-found") {
    redirect("/admin/access-profiles?error=invalid-profile");
  }

  if (deleteResult === "has-authors") {
    redirect("/admin/access-profiles?error=profile-has-authors");
  }

  revalidateAuthorProfileSurfaces();
  redirect("/admin/access-profiles?deleted=1");
}
