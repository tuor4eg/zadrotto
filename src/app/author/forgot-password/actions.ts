"use server";

import { redirect } from "next/navigation";

import { issueAuthorAuthChallenge, enqueueEncryptedEmail } from "@/db/operations/author-auth";
import { getActiveAuthorAccountByPrimaryEmail } from "@/db/queries/author-auth";
import { normalizeAuthorEmail } from "@/lib/auth/author-account";
import { checkAuthorAuthMutationRateLimit } from "@/lib/auth/mutation-rate-limit";
import { checkForgotPasswordCooldown } from "@/lib/auth/forgot-password-rate-limit";
import { getAuthRequestIpAddress } from "@/lib/auth/rate-limits";
import { isAuthorEmailDeliveryConfigured } from "@/lib/auth/features";

export async function forgotAuthorPasswordAction(formData: FormData) {
  const value = formData.get("email");
  const email = typeof value === "string" ? value.trim() : "";
  const normalizedEmail = normalizeAuthorEmail(email);
  const rateLimit = await checkAuthorAuthMutationRateLimit("author-forgot", normalizedEmail);
  if (!rateLimit.ok) {
    redirect(rateLimit.reason === "limited"
      ? `/author/forgot-password?retryAfter=${rateLimit.retryAfterSeconds}`
      : "/author/forgot-password?unavailable=1");
  }
  const cooldown = await checkForgotPasswordCooldown({
    ipAddress: await getAuthRequestIpAddress(),
    normalizedEmail,
  });
  if (!cooldown.ok) {
    redirect(cooldown.reason === "limited"
      ? `/author/forgot-password?retryAfter=${cooldown.retryAfterSeconds}`
      : "/author/forgot-password?unavailable=1");
  }
  if (!(await isAuthorEmailDeliveryConfigured())) redirect("/author/forgot-password?unavailable=1");
  let accountFound = false;
  try {
    const account = email ? await getActiveAuthorAccountByPrimaryEmail(normalizedEmail) : null;
    if (account) {
      accountFound = true;
      const { token } = await issueAuthorAuthChallenge({
        authorId: account.authorId,
        emailId: account.emailId,
        purpose: "reset_password",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await enqueueEncryptedEmail({ template: "reset_password", recipient: account.email, payload: { token } });
    }
  } catch {
    redirect("/author/forgot-password?unavailable=1");
  }
  if (!accountFound) redirect("/author/forgot-password?notFound=1");
  redirect("/author/forgot-password?sent=1");
}
