import { JobError } from "@/lib/jobs/types";
import { buildEditorialSummaryContext, getEditorialSummarySourceHash, isEditorialSummaryResponse, isEditorialSummaryStale, type EditorialSummaryResponse, type EditorialSummarySource } from "./editorial-summary";

export async function runEditorialSummaryFlow(input: {
  mediaItemId: number;
  source: EditorialSummarySource & { locked: boolean | null; sourceHash: string | null };
  prompt: string;
  force?: boolean;
  generate: (context: ReturnType<typeof buildEditorialSummaryContext>) => Promise<{
    value: EditorialSummaryResponse;
    modelId: string;
  }>;
  save: (result: {
    mediaItemId: number;
    sourceHash: string;
    prompt: string;
    description: string | null;
    modelId: string;
  }) => Promise<boolean>;
}) {
  if (input.source.locked) return "locked" as const;
  const sourceHash = getEditorialSummarySourceHash(input.source, input.prompt);
  if (!input.force && !isEditorialSummaryStale({
    locked: false,
    sourceHash: input.source.sourceHash,
    currentHash: sourceHash,
  })) return "current" as const;
  const context = buildEditorialSummaryContext(input.source);
  const result = await input.generate({
    ...context,
    description: context.description?.slice(0, 6_000) ?? null,
  });
  if (!isEditorialSummaryResponse(result.value)) {
    throw new JobError("invalid-response", "AI вернул непригодный формат справки.", { retryable: false });
  }
  const saved = await input.save({
    mediaItemId: input.mediaItemId,
    sourceHash,
    prompt: input.prompt,
    description: result.value.usable ? result.value.description.trim() : null,
    modelId: result.modelId,
  });
  return saved ? result.value.usable ? "ready" as const : "unusable" as const : "changed" as const;
}
