"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createMediaType,
  deleteMediaTypeIfUnused,
  setMediaTypePublicAvailability,
  updateMediaType,
} from "@/db/queries/media-types";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/common/app-error-messages";
import { slugifyCodePart } from "@/lib/common/generated-code";
import {
  normalizeOptionalMediaTypeString,
  parseRequiredMediaTypeId,
} from "@/lib/forms/media-type";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function readMediaTypeForm(formData: FormData) {
  const name = getFormString(formData, "name");

  if (!name) {
    return { ok: false as const, error: "required" };
  }

  return {
    ok: true as const,
    value: {
      name,
      description: normalizeOptionalMediaTypeString(getFormString(formData, "description")),
      isPubliclyAvailable: formData.get("isPubliclyAvailable") === "1",
      isAvailableToGuests: formData.get("isAvailableToGuests") === "1",
      enabledByDefault: formData.get("enabledByDefault") === "1",
    },
  };
}

export async function setMediaTypePublicAvailabilityAction(formData: FormData) {
  await requireAdminUser();

  const mediaTypeId = parseRequiredMediaTypeId(getFormString(formData, "mediaTypeId"));

  if (!mediaTypeId.ok) {
    redirect("/admin/media-types?error=invalid-type");
  }

  let mediaType;

  try {
    mediaType = await setMediaTypePublicAvailability(
      mediaTypeId.value,
      formData.get("isPubliclyAvailable") === "1",
    );
  } catch (error) {
    console.error(error);
    redirect(`/admin/media-types?error=${getAdminFormErrorCode(error)}`);
  }

  if (!mediaType) {
    redirect("/admin/media-types?error=invalid-type");
  }

  revalidateMediaTypeSurfaces();
  redirect(`/admin/media-types?visibility-updated=1`);
}

function revalidateMediaTypeSurfaces() {
  revalidatePath("/admin/media-types");
  revalidatePath("/admin/media");
  revalidatePath("/admin/media/new");
  revalidatePath("/admin/media-carriers");
  revalidatePath("/admin/media-carriers/new");
  revalidatePath("/author/media");
  revalidatePath("/author/media/new");
  revalidatePath("/author/settings/media-types");
  revalidatePath("/series");
  revalidatePath("/series/[code]", "page");
  revalidatePath("/media/[code]", "page");
  revalidatePath("/");
}

export async function createMediaTypeAction(formData: FormData) {
  await requireAdminUser();

  const input = readMediaTypeForm(formData);

  if (!input.ok) {
    redirect(`/admin/media-types/new?error=${input.error}`);
  }

  try {
    await createMediaType({
      ...input.value,
      code: slugifyCodePart(input.value.name),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/admin/media-types/new?error=duplicate-code");
    }

    console.error(error);
    redirect(`/admin/media-types/new?error=${getAdminFormErrorCode(error)}`);
  }

  revalidateMediaTypeSurfaces();
  redirect("/admin/media-types?created=1");
}

export async function updateMediaTypeAction(formData: FormData) {
  await requireAdminUser();

  const mediaTypeId = parseRequiredMediaTypeId(getFormString(formData, "mediaTypeId"));
  const input = readMediaTypeForm(formData);

  if (!mediaTypeId.ok) {
    redirect("/admin/media-types?error=invalid-type");
  }

  if (!input.ok) {
    redirect(`/admin/media-types/${mediaTypeId.value}/edit?error=${input.error}`);
  }

  let mediaType;

  try {
    mediaType = await updateMediaType({
      id: mediaTypeId.value,
      ...input.value,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/media-types/${mediaTypeId.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!mediaType) {
    redirect("/admin/media-types?error=invalid-type");
  }

  revalidateMediaTypeSurfaces();
  revalidatePath(`/admin/media-types/${mediaTypeId.value}/edit`);
  redirect(`/admin/media-types/${mediaTypeId.value}/edit?updated=1`);
}

export async function deleteMediaTypeAction(formData: FormData) {
  await requireAdminUser();

  const mediaTypeId = parseRequiredMediaTypeId(getFormString(formData, "mediaTypeId"));

  if (!mediaTypeId.ok) {
    redirect("/admin/media-types?error=invalid-type");
  }

  let deleteResult;

  try {
    deleteResult = await deleteMediaTypeIfUnused(mediaTypeId.value);
  } catch (error) {
    console.error(error);
    redirect(`/admin/media-types?error=${getAdminFormErrorCode(error)}`);
  }

  if (deleteResult === "not-found") {
    redirect("/admin/media-types?error=invalid-type");
  }

  if (deleteResult === "has-media") {
    redirect("/admin/media-types?error=type-has-media");
  }

  revalidateMediaTypeSurfaces();
  redirect("/admin/media-types?deleted=1");
}
