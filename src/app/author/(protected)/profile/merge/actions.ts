"use server";

import { randomUUID } from "node:crypto";
import { getAccountMergeFailureDiagnostic } from "@/lib/auth/account-merge-diagnostics";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { redirect } from "next/navigation";
import { AccountMergeError, confirmAccountMerge } from "@/db/operations/account-merge";
import { requireAuthorSession, writeAuthorSessionCookie } from "@/lib/auth/author-auth";

export async function confirmAccountMergeAction(_state: string | null, formData: FormData): Promise<string | null> {
  const current = await requireAuthorSession();
  let token: string;
  try {
    const result = await confirmAccountMerge({
      grantId: String(formData.get("grant") ?? ""),
      authorId: current.author.id,
      sessionId: current.session.sessionId,
      primaryAuthorId: Number(formData.get("primary")),
      version: String(formData.get("version") ?? ""),
    });
    token = result.token;
  } catch (error) {
    if (error instanceof AccountMergeError) return error.code;
    const incidentId = randomUUID();
    const metadata = { incidentId, ...getAccountMergeFailureDiagnostic(error) };
    console.error("Account merge failed", metadata);
    await logSystemActivity({ action: "author.accounts.merge.failed", entityType: "author", entityId: current.author.id,
      message: "Не удалось объединить аккаунты.", status: "failure", severity: "warning", metadata });
    return `unavailable:${incidentId}`;
  }
  await writeAuthorSessionCookie(token);
  redirect("/author/profile?accountsMerged=1");
}
