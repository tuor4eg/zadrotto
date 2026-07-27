"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAccessibleMediaTypeOptions,
  resetAuthorMediaTypeOverrides,
  saveAuthorMediaTypeOverrides,
} from "@/db/queries/media-types";
import { requireAuthor } from "@/lib/auth/author-auth";

const SETTINGS_PATH = "/author/settings/media-types";

function revalidateMediaTypeVisibilitySurfaces() {
  revalidatePath(SETTINGS_PATH);
  revalidatePath("/");
  revalidatePath("/series");
  revalidatePath("/series/[code]", "page");
  revalidatePath("/media/[code]", "page");
}

function parseMediaTypeIds(values: FormDataEntryValue[]) {
  const ids = values.map((value) => Number(value));

  return ids.every((id) => Number.isSafeInteger(id) && id > 0)
    ? ids
    : null;
}

export async function saveAuthorMediaTypeSettingsAction(formData: FormData) {
  const author = await requireAuthor();
  const mediaTypeIds = parseMediaTypeIds(formData.getAll("mediaTypeId"));
  const enabledMediaTypeIds = parseMediaTypeIds(formData.getAll("enabledMediaTypeId"));

  if (!mediaTypeIds || !enabledMediaTypeIds) {
    redirect(`${SETTINGS_PATH}?error=invalid`);
  }

  const availableIds = new Set(mediaTypeIds);
  const accessibleMediaTypes = await getAccessibleMediaTypeOptions(author.id);
  const accessibleIds = new Set(accessibleMediaTypes.map(({ id }) => id));

  if (
    enabledMediaTypeIds.some((id) => !availableIds.has(id)) ||
    mediaTypeIds.length !== accessibleIds.size ||
    mediaTypeIds.some((id) => !accessibleIds.has(id))
  ) {
    redirect(`${SETTINGS_PATH}?error=invalid`);
  }

  try {
    await saveAuthorMediaTypeOverrides({
      authorId: author.id,
      settings: mediaTypeIds.map((mediaTypeId) => ({
        mediaTypeId,
        isEnabled: enabledMediaTypeIds.includes(mediaTypeId),
      })),
    });
  } catch {
    redirect(`${SETTINGS_PATH}?error=invalid`);
  }

  revalidateMediaTypeVisibilitySurfaces();
  redirect(`${SETTINGS_PATH}?saved=1`);
}

export async function resetAuthorMediaTypeSettingsAction() {
  const author = await requireAuthor();

  await resetAuthorMediaTypeOverrides(author.id);
  revalidateMediaTypeVisibilitySurfaces();
  redirect(`${SETTINGS_PATH}?reset=1`);
}
