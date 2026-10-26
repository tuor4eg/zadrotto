"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { CreatorRequestError, resolveCreatorRequest } from "@/db/queries/creator-requests";
import { rejectAnimeCompanyLogoCandidate, repairLegacyAnimeCompanyLogoIgnore } from "@/db/queries/anime-company-logo-binding";
import { isCreatorRequestErrorCode } from "./messages";

function id(value: FormDataEntryValue | null) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error("invalid-id");
  return result;
}

async function applyLogoDecision(formData: FormData, decision: "map" | "reject" | "repair") {
  const admin = await requireAdminUser();
  let requestId: number | null = null;
  try {
    requestId = id(formData.get("requestId"));
    if (decision === "repair") await repairLegacyAnimeCompanyLogoIgnore({ requestId, adminId: admin.id });
    else {
      const creatorId = id(formData.get("creatorId"));
      if (decision === "reject") await rejectAnimeCompanyLogoCandidate({ requestId, creatorId, adminId: admin.id });
      else await resolveCreatorRequest({ requestId, creatorId, logoCandidateCreatorId: creatorId, decision: "map", adminId: admin.id });
    }
  } catch (error) {
    const code = error instanceof CreatorRequestError && isCreatorRequestErrorCode(error.code) ? error.code : "1";
    redirect(`/admin/creator-requests${requestId ? `/${requestId}` : ""}?error=${code}`);
  }
  revalidatePath("/", "layout");
  redirect("/admin/creator-requests?updated=1");
}

export async function confirmLogoCandidateAction(formData: FormData) { await applyLogoDecision(formData, "map"); }
export async function rejectLogoCandidateAction(formData: FormData) { await applyLogoDecision(formData, "reject"); }
export async function repairLogoIgnoreAction(formData: FormData) { await applyLogoDecision(formData, "repair"); }
