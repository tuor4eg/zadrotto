"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ExternalAuthError, unlinkExternalAuthIdentity } from "@/db/operations/external-auth";
import { clearAuthorSessionCookie, requireAuthorSession } from "@/lib/auth/author-auth";
import { getAvailableExternalProviders } from "@/lib/auth/external/registry";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { logActivity } from "@/lib/activity-logs/server";

export async function unlinkExternalProviderAction(formData: FormData) {
  const current = await requireAuthorSession();
  if (!current) redirect("/author/login");
  const identityId = Number(formData.get("identityId"));
  if (!Number.isSafeInteger(identityId) || identityId <= 0) redirect("/author/profile?externalError=conflict");
  const limit = await checkAuthorAuthMutationRateLimit("author-external-unlink", String(current.author.id));
  if (!limit.ok) redirect("/author/profile?externalError=unavailable");
  let currentSessionRevoked = false;
  try {
    const result = await unlinkExternalAuthIdentity({ authorId: current.author.id,
      sessionId: current.session.sessionId, identityId,
      availableProviders: (await getAvailableExternalProviders()).map(({ code }) => code) });
    currentSessionRevoked = result.currentSessionRevoked;
  } catch (error) {
    redirect(`/author/profile?externalError=${error instanceof ExternalAuthError ? error.code : "unavailable"}`);
  }
  await logActivity({ action: "author.external.unlinked", actorType: "author", authorId: current.author.id,
    message: "Автор отключил внешний способ входа.", metadata: { identityId } });
  revalidatePath("/author/profile");
  if (currentSessionRevoked) {
    await clearAuthorSessionCookie();
    redirect("/author/login?externalUnlinked=1");
  }
  redirect("/author/profile?externalUnlinked=1");
}
