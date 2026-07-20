"use server";

import { redirect } from "next/navigation";

import { verifyAuthorEmailChallenge } from "@/db/operations/author-auth";
import { hashAuthorAuthChallengeToken } from "@/lib/auth/challenges";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { logActivity } from "@/lib/activity-logs/server";

export async function verifyAuthorEmailAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-verify", token);
  if (!rateLimit.ok) redirect("/author/login?verificationError=1");
  const result = token ? await verifyAuthorEmailChallenge(hashAuthorAuthChallengeToken(token)) : null;
  if (result) {
    await logActivity({
      action: "author.registration.verified",
      actorType: "author",
      authorId: result.authorId,
      entityType: "author-account",
      entityId: result.authorId,
      message: "Email автора подтверждён.",
      metadata: { nextStatus: result.status },
    });
  }
  redirect(result?.purpose === "change_email" ? "/author/login?emailChanged=1" : result?.status === "active" ? "/author/login?verified=1" : result ? "/author/login?pending=1" : "/author/login?verificationError=1");
}
