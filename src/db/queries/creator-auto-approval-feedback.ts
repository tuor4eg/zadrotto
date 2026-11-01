import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminActivityLogs } from "@/db/schema";

/** Historical review evidence, not a fresh identity match or permission to bind. */
export async function getCreatorAutoApprovalFeedback(requestId: number) {
  const [log] = await db.select({ message: adminActivityLogs.message, metadata: adminActivityLogs.metadata })
    .from(adminActivityLogs)
    .where(and(eq(adminActivityLogs.entityType, "creator-request"), eq(adminActivityLogs.entityId, requestId), eq(adminActivityLogs.action, "creator-request.auto-skipped")))
    .orderBy(desc(adminActivityLogs.id)).limit(1);
  if (!log) return null;
  const candidates = Array.isArray(log.metadata?.candidates) ? log.metadata.candidates : [];
  return {
    message: log.message || "Заявка требует ручной проверки.",
    candidates: candidates.flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const candidate = value as { id?: unknown; name?: unknown };
      return typeof candidate.id === "number" && Number.isSafeInteger(candidate.id) && candidate.id > 0 && typeof candidate.name === "string"
        ? [{ id: candidate.id, name: candidate.name }] : [];
    }),
  };
}
