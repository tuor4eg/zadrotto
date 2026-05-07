"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAuthorAccessToken,
  revokeAuthorAccessToken,
} from "@/db/queries/author-access-tokens";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getAdminFormErrorCode,
  getAdminFormErrorMessage,
} from "@/lib/app-error-messages";
import { generateAuthorAccessToken, hashAuthorAccessToken } from "@/lib/author-access-token";

export type CreateAuthorTokenState = {
  accessToken: string | null;
  error: string | null;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getFormNumber(formData: FormData, key: string) {
  const value = Number(getFormString(formData, key));

  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function createAuthorTokenAction(
  _previousState: CreateAuthorTokenState,
  formData: FormData,
): Promise<CreateAuthorTokenState> {
  const adminUser = await requireAdminUser();
  const authorId = getFormNumber(formData, "authorId");
  const label = getFormString(formData, "label");

  if (!authorId || !label) {
    return {
      accessToken: null,
      error: "Выбери автора и заполни метку.",
    };
  }

  const accessToken = generateAuthorAccessToken();

  try {
    await createAuthorAccessToken({
      authorId,
      tokenHash: hashAuthorAccessToken(accessToken),
      label,
      createdByAdminId: adminUser.id,
    });
  } catch (error) {
    console.error(error);

    return {
      accessToken: null,
      error: getAdminFormErrorMessage(getAdminFormErrorCode(error)),
    };
  }

  revalidatePath("/admin/author-tokens");

  return {
    accessToken,
    error: null,
  };
}

export async function revokeAuthorTokenAction(formData: FormData) {
  await requireAdminUser();

  const tokenId = getFormNumber(formData, "tokenId");

  if (tokenId) {
    try {
      await revokeAuthorAccessToken(tokenId);
    } catch (error) {
      console.error(error);
      redirect(`/admin/author-tokens?error=${getAdminFormErrorCode(error)}`);
    }
  }

  revalidatePath("/admin/author-tokens");
  redirect("/admin/author-tokens?updated=1");
}
