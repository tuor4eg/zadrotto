"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { retryFailedEmailOutbox } from "@/db/queries/email-outbox";
import { prepareActivityLog } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";

export async function retryEmailOutboxAction(formData: FormData) {
  const admin = await requireAdminUser();
  const rawId = formData.get("id");
  const id = rawId ? Number(rawId) : undefined;
  if (id !== undefined && (!Number.isInteger(id) || id <= 0)) redirect("/admin/tools/email/queue?error=invalid");
  const activityLog = await prepareActivityLog({ action: "email-outbox.retry-requested", actorType: "admin", adminUserId: admin.id, entityType: "email-outbox", entityId: id ?? null, entityLabel: id ? `Email #${id}` : "Ошибочные email", message: "Email возвращены в очередь." });
  const count = await retryFailedEmailOutbox(id ? { id, activityLog } : { limit: 100, activityLog });
  revalidatePath("/admin/tools/email/queue");
  redirect(`/admin/tools/email/queue?retried=${count}`);
}
