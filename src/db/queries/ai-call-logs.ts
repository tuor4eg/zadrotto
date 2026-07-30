import { db } from "@/db";
import { aiCallLogs } from "@/db/schema";
import type { AiErrorCode, AiUsage } from "@/lib/ai/types";

export async function createAiCallLog(input: {
  scenarioProfileId: number | null;
  profileKey: string;
  providerCode: string | null;
  modelId: string | null;
  status: "success" | "failure";
  latencyMs: number;
  usage?: AiUsage;
  providerRequestId?: string;
  errorCode?: AiErrorCode;
}) {
  try {
    await db.insert(aiCallLogs).values({
      ...input,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
    });
  } catch (error) {
    console.error("Failed to write AI call log", error);
  }
}
