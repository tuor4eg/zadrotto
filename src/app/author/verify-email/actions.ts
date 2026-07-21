"use server";

import { redirect } from "next/navigation";

import { verifyAuthorEmailChallenge } from "@/db/operations/author-auth";
import { clearAuthorSessionCookie, getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { hashAuthorAuthChallengeToken } from "@/lib/auth/challenges";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { logActivity } from "@/lib/activity-logs/server";

export async function verifyAuthorEmailAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const current = await getCurrentAuthorSession();
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-verify", token);
  if (!rateLimit.ok) redirect("/author/login?verificationError=1");
  const result = token ? await verifyAuthorEmailChallenge(hashAuthorAuthChallengeToken(token)) : null;
  if (result?.purpose === "change_email") {
    await logActivity({
      action: "author.email.changed",
      actorType: "author",
      authorId: result.authorId,
      entityType: "author-account",
      entityId: result.authorId,
      message: "Новый email автора подтверждён.",
      metadata: { stage: "confirmed" },
    });
    if (current?.author.id === result.authorId) await clearAuthorSessionCookie();
    redirect("/author/login?emailChanged=1");
  }
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
  redirect(result && current?.author.id === result.authorId ? "/author/profile?verified=1" : result ? "/author/login?verified=1" : "/author/login?verificationError=1");
}
