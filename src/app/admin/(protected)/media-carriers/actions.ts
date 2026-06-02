"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createMediaCarrier,
  deleteMediaCarrierIfUnused,
  getMediaCarrierById,
  updateMediaCarrier,
} from "@/db/queries/media-carriers";
import { mediaTypeExistsByCode } from "@/db/queries/media-types";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/app-error-messages";
import { generateEntityCode } from "@/lib/generated-code";
import {
  normalizeOptionalMediaCarrierString,
  parseRequiredMediaCarrierId,
} from "@/lib/media-carrier-form";
import { isMediaTypeCode, type MediaType } from "@/lib/media-types";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseMediaType(value: string): MediaType | null {
  return isMediaTypeCode(value) ? value : null;
}

function readMediaCarrierForm(formData: FormData) {
  const name = getFormString(formData, "name");
  const mediaType = parseMediaType(getFormString(formData, "mediaType"));

  if (!name || !mediaType) {
    return { ok: false as const, error: "required" };
  }

  return {
    ok: true as const,
    value: {
      name,
      mediaType,
      description: normalizeOptionalMediaCarrierString(getFormString(formData, "description")),
    },
  };
}

function revalidateMediaCarrierSurfaces() {
  revalidatePath("/admin/media-carriers");
  revalidatePath("/admin/media");
  revalidatePath("/admin/media/new");
  revalidatePath("/author/media/new");
}

export async function createMediaCarrierAction(formData: FormData) {
  await requireAdminUser();

  const input = readMediaCarrierForm(formData);

  if (!input.ok) {
    redirect(`/admin/media-carriers/new?error=${input.error}`);
  }

  if (!(await mediaTypeExistsByCode(input.value.mediaType))) {
    redirect("/admin/media-carriers/new?error=required");
  }

  try {
    await createMediaCarrier({
      ...input.value,
      code: generateEntityCode({ type: "carrier", name: input.value.name }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/admin/media-carriers/new?error=duplicate-code");
    }

    console.error(error);
    redirect(`/admin/media-carriers/new?error=${getAdminFormErrorCode(error)}`);
  }

  revalidateMediaCarrierSurfaces();
  redirect("/admin/media-carriers?created=1");
}

export async function updateMediaCarrierAction(formData: FormData) {
  await requireAdminUser();

  const carrierId = parseRequiredMediaCarrierId(getFormString(formData, "carrierId"));
  const input = readMediaCarrierForm(formData);

  if (!carrierId.ok) {
    redirect("/admin/media-carriers?error=invalid-carrier");
  }

  if (!input.ok) {
    redirect(`/admin/media-carriers/${carrierId.value}/edit?error=${input.error}`);
  }

  if (!(await mediaTypeExistsByCode(input.value.mediaType))) {
    redirect(`/admin/media-carriers/${carrierId.value}/edit?error=required`);
  }

  const existingCarrier = await getMediaCarrierById(carrierId.value);

  if (!existingCarrier) {
    redirect("/admin/media-carriers?error=invalid-carrier");
  }

  if (
    existingCarrier.mediaItemsCount > 0 &&
    existingCarrier.mediaType !== input.value.mediaType
  ) {
    redirect(`/admin/media-carriers/${carrierId.value}/edit?error=carrier-has-media`);
  }

  let carrier;

  try {
    carrier = await updateMediaCarrier({
      id: carrierId.value,
      ...input.value,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/media-carriers/${carrierId.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!carrier) {
    redirect("/admin/media-carriers?error=invalid-carrier");
  }

  revalidateMediaCarrierSurfaces();
  revalidatePath(`/admin/media-carriers/${carrierId.value}/edit`);
  redirect(`/admin/media-carriers/${carrierId.value}/edit?updated=1`);
}

export async function deleteMediaCarrierAction(formData: FormData) {
  await requireAdminUser();

  const carrierId = parseRequiredMediaCarrierId(getFormString(formData, "carrierId"));

  if (!carrierId.ok) {
    redirect("/admin/media-carriers?error=invalid-carrier");
  }

  let deleteResult;

  try {
    deleteResult = await deleteMediaCarrierIfUnused(carrierId.value);
  } catch (error) {
    console.error(error);
    redirect(`/admin/media-carriers?error=${getAdminFormErrorCode(error)}`);
  }

  if (deleteResult === "not-found") {
    redirect("/admin/media-carriers?error=invalid-carrier");
  }

  if (deleteResult === "has-media-items") {
    redirect("/admin/media-carriers?error=carrier-has-media");
  }

  revalidateMediaCarrierSurfaces();
  redirect("/admin/media-carriers?deleted=1");
}
