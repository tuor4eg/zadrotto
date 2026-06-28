"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addMediaItemToFranchise,
  createFranchise,
  deleteFranchiseIfEmpty,
  getAdminFranchiseById,
  getAdminMediaItemFranchiseIdentityById,
  removeMediaItemFromFranchise,
  updateFranchise,
} from "@/db/queries/franchises";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import {
  normalizeOptionalFranchiseString,
  parseRequiredFranchiseId,
} from "@/lib/forms/admin-franchise";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/common/app-error-messages";
import { generateEntityCode } from "@/lib/common/generated-code";
import { logActivity } from "@/lib/activity-logs/server";

export type CreateInlineFranchiseState = {
  error: string | null;
  franchise: {
    id: number;
    title: string;
    originalTitle: string | null;
  } | null;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFranchiseInput(formData: FormData) {
  const title = getFormString(formData, "title");

  if (!title) {
    return { ok: false as const, error: "required" };
  }

  return {
    ok: true as const,
    value: {
      title,
      originalTitle: normalizeOptionalFranchiseString(getFormString(formData, "originalTitle")),
      description: normalizeOptionalFranchiseString(getFormString(formData, "description")),
    },
  };
}

function revalidateFranchiseSurfaces() {
  revalidatePath("/admin/franchises");
  revalidatePath("/", "layout");
}

function parseRequiredPositiveInteger(value: string) {
  if (!/^\d+$/.test(value)) {
    return { ok: false as const };
  }

  const parsedValue = Number(value);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? { ok: true as const, value: parsedValue }
    : { ok: false as const };
}

export async function createFranchiseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const input = getFranchiseInput(formData);

  if (!input.ok) {
    redirect(`/admin/franchises/new?error=${input.error}`);
  }

  let franchise;

  try {
    franchise = await createFranchise({
      ...input.value,
      code: generateEntityCode({ type: "series", name: input.value.title }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/admin/franchises/new?error=duplicate-code");
    }

    console.error(error);
    redirect(`/admin/franchises/new?error=${getAdminFormErrorCode(error)}`);
  }

  revalidateFranchiseSurfaces();
  await logActivity({
    action: "franchise.created",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Серия создана.",
  });
  redirect("/admin/franchises?created=1");
}

export async function createInlineFranchiseAction(
  _previousState: CreateInlineFranchiseState,
  formData: FormData,
): Promise<CreateInlineFranchiseState> {
  const adminUser = await requireAdminUser();

  const input = getFranchiseInput(formData);

  if (!input.ok) {
    return { error: input.error, franchise: null };
  }

  let franchise;

  try {
    franchise = await createFranchise({
      ...input.value,
      code: generateEntityCode({ type: "series", name: input.value.title }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "duplicate-code", franchise: null };
    }

    console.error(error);
    return { error: getAdminFormErrorCode(error), franchise: null };
  }

  revalidateFranchiseSurfaces();
  revalidatePath("/admin/media");
  revalidatePath("/admin/media/new");
  await logActivity({
    action: "franchise.created",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Серия создана.",
    metadata: { source: "inline-media-form" },
  });

  return {
    error: null,
    franchise: {
      id: franchise.id,
      title: input.value.title,
      originalTitle: input.value.originalTitle,
    },
  };
}

export async function updateFranchiseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const id = parseRequiredFranchiseId(getFormString(formData, "franchiseId"));
  const input = getFranchiseInput(formData);

  if (!id.ok) {
    redirect("/admin/franchises?error=invalid-franchise");
  }

  if (!input.ok) {
    redirect(`/admin/franchises/${id.value}/edit?error=${input.error}`);
  }

  let franchise;

  try {
    franchise = await updateFranchise({
      id: id.value,
      ...input.value,
    });

    if (!franchise) {
      redirect(`/admin/franchises/${id.value}/edit?error=invalid-franchise`);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect(`/admin/franchises/${id.value}/edit?error=duplicate-code`);
    }

    console.error(error);
    redirect(`/admin/franchises/${id.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  revalidateFranchiseSurfaces();
  await logActivity({
    action: "franchise.updated",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Серия изменена.",
  });
  redirect(`/admin/franchises/${id.value}/edit?updated=1`);
}

export async function deleteFranchiseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const id = parseRequiredFranchiseId(getFormString(formData, "franchiseId"));

  if (!id.ok) {
    redirect("/admin/franchises?error=invalid-franchise");
  }

  let franchise;

  try {
    franchise = await deleteFranchiseIfEmpty(id.value);
  } catch (error) {
    console.error(error);
    redirect(`/admin/franchises?error=${getAdminFormErrorCode(error)}`);
  }

  if (!franchise) {
    redirect("/admin/franchises?error=not-empty");
  }

  revalidateFranchiseSurfaces();
  await logActivity({
    action: "franchise.deleted",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Серия удалена.",
  });
  redirect("/admin/franchises?deleted=1");
}

export async function addMediaItemToFranchiseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const franchiseId = parseRequiredFranchiseId(getFormString(formData, "franchiseId"));
  const mediaItemId = parseRequiredPositiveInteger(getFormString(formData, "mediaItemId"));

  if (!franchiseId.ok || !mediaItemId.ok) {
    redirect("/admin/franchises?error=invalid-franchise");
  }

  const franchise = await getAdminFranchiseById(franchiseId.value);

  if (!franchise) {
    redirect("/admin/franchises?error=invalid-franchise");
  }

  const itemBeforeUpdate = await getAdminMediaItemFranchiseIdentityById(mediaItemId.value);

  if (!itemBeforeUpdate) {
    redirect(`/admin/franchises/${franchiseId.value}/edit?error=invalid-media`);
  }

  let item;

  try {
    item = await addMediaItemToFranchise({
      franchiseId: franchiseId.value,
      mediaItemId: mediaItemId.value,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/franchises/${franchiseId.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!item) {
    redirect(`/admin/franchises/${franchiseId.value}/edit?error=invalid-media`);
  }

  revalidateFranchiseSurfaces();
  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/${mediaItemId.value}/edit`);
  revalidatePath(`/admin/franchises/${franchiseId.value}/edit`);
  revalidatePath(`/franchises/${franchise.code}`);
  revalidatePath(`/media/${item.code}`);

  for (const existingFranchise of itemBeforeUpdate.franchises) {
    revalidatePath(`/admin/franchises/${existingFranchise.id}/edit`);
    revalidatePath(`/franchises/${existingFranchise.code}`);
  }

  await logActivity({
    action: "franchise.media.attached",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Запись привязана к серии.",
    metadata: {
      mediaItemId: item.id,
      mediaItemTitle: item.title,
      franchiseIds: [
        ...itemBeforeUpdate.franchises.map((existingFranchise) => existingFranchise.id),
        franchiseId.value,
      ],
    },
  });
  redirect(`/admin/franchises/${franchiseId.value}/edit?attached=1`);
}

export async function removeMediaItemFromFranchiseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const franchiseId = parseRequiredFranchiseId(getFormString(formData, "franchiseId"));
  const mediaItemId = parseRequiredPositiveInteger(getFormString(formData, "mediaItemId"));

  if (!franchiseId.ok || !mediaItemId.ok) {
    redirect("/admin/franchises?error=invalid-franchise");
  }

  const franchise = await getAdminFranchiseById(franchiseId.value);

  if (!franchise) {
    redirect("/admin/franchises?error=invalid-franchise");
  }

  let item;

  try {
    item = await removeMediaItemFromFranchise({
      franchiseId: franchiseId.value,
      mediaItemId: mediaItemId.value,
    });
  } catch (error) {
    console.error(error);
    redirect(`/admin/franchises/${franchiseId.value}/edit?error=${getAdminFormErrorCode(error)}`);
  }

  if (!item) {
    redirect(`/admin/franchises/${franchiseId.value}/edit?error=invalid-media`);
  }

  revalidateFranchiseSurfaces();
  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/${mediaItemId.value}/edit`);
  revalidatePath(`/admin/franchises/${franchiseId.value}/edit`);
  revalidatePath(`/franchises/${franchise.code}`);
  revalidatePath(`/media/${item.code}`);

  await logActivity({
    action: "franchise.media.detached",
    actorType: "admin",
    adminUserId: adminUser.id,
    entityType: "franchise",
    entityId: franchise.id,
    entityLabel: franchise.title,
    message: "Запись отвязана от серии.",
    metadata: {
      mediaItemId: item.id,
      mediaItemTitle: item.title,
    },
  });
  redirect(`/admin/franchises/${franchiseId.value}/edit?detached=1`);
}
