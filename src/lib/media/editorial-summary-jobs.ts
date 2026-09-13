import "server-only";

import { enqueueEditorialSummaryRun, getEditorialSummaryJob, getEditorialSummaryQueueState, getEditorialSummarySource, listEditorialSummarySources, saveGeneratedEditorialSummary } from "@/db/queries/editorial-summaries";
import { generateAiObject } from "@/lib/ai/service";
import { getEnabledAiScenarioProfile } from "@/db/queries/ai-scenarios";
import { checkFixedWindowRateLimits } from "@/lib/rate-limits/redis";
import { JobError } from "@/lib/jobs/types";
import { EDITORIAL_SUMMARY_SCENARIO_KEY, EDITORIAL_SUMMARY_SCHEMA, EDITORIAL_SUMMARY_SYSTEM_PROMPT, getEditorialSummarySourceHash, isEditorialSummaryResponse, isEditorialSummaryStale, nextEditorialSummaryAvailableAt, parseEditorialSummaryOptions } from "./editorial-summary";
import { runEditorialSummaryFlow } from "./editorial-summary-flow";

export async function sweepEditorialSummaries() {
  const job = await getEditorialSummaryJob();
  if (!job) throw new JobError("configuration", "Задача справок не настроена.", { retryable: false });
  if (!await getEnabledAiScenarioProfile(EDITORIAL_SUMMARY_SCENARIO_KEY)) {
    throw new JobError("ai-scenario-disabled", "Создайте и включите AI-сценарий «Редакционные справки».", { retryable: false });
  }
  const { prompt } = parseEditorialSummaryOptions(job.options);
  const queue = await getEditorialSummaryQueueState();
  let slots = Math.max(0, 25 - queue.count);
  let lastAvailableAt = queue.lastAvailableAt;
  let afterId = 0;
  while (slots > 0) {
    const batch = await listEditorialSummarySources(afterId, 100);
    if (batch.length === 0) break;
    for (const item of batch) {
      afterId = item.id;
      if (item.locked) continue;
      const hash = getEditorialSummarySourceHash(item, prompt);
      if (!isEditorialSummaryStale({ locked: false, sourceHash: item.sourceHash, currentHash: hash })) continue;
      const availableAt = nextEditorialSummaryAvailableAt(lastAvailableAt, new Date());
      const result = await enqueueEditorialSummaryRun({ mediaItemId: item.id, source: "event", availableAt });
      if (result.created) {
        slots -= 1;
        lastAvailableAt = availableAt;
      }
      if (slots === 0) break;
    }
    if (batch.length < 100) break;
  }
}

export async function generateEditorialSummary(mediaItemId: number, force = false) {
  const [job, item] = await Promise.all([getEditorialSummaryJob(), getEditorialSummarySource(mediaItemId)]);
  if (!job) throw new JobError("configuration", "Задача справок не настроена.", { retryable: false });
  if (!item || item.locked) return;
  const { prompt } = parseEditorialSummaryOptions(job.options);
  const sourceHash = getEditorialSummarySourceHash(item, prompt);
  if (!force && !isEditorialSummaryStale({ locked: false, sourceHash: item.sourceHash, currentHash: sourceHash })) return;
  if (!await getEnabledAiScenarioProfile(EDITORIAL_SUMMARY_SCENARIO_KEY)) {
    throw new JobError("ai-scenario-disabled", "Создайте и включите AI-сценарий «Редакционные справки».", { retryable: false });
  }

  const rate = await checkFixedWindowRateLimits([
    { keyPrefix: "ai-job:editorial-summary", subject: "global", window: "minute", limit: 5 },
    { keyPrefix: "ai-job:editorial-summary", subject: "global", window: "day", limit: 200 },
  ]);
  if (!rate.ok) throw new JobError("rate-limit-unavailable", "Не удалось проверить лимит AI.", { deferSeconds: 60 });
  if (!rate.allowed) throw new JobError("ai-rate-limit", "Лимит AI временно исчерпан.", { deferSeconds: rate.retryAfterSeconds });

  await runEditorialSummaryFlow({
    mediaItemId,
    source: item,
    prompt,
    force,
    generate: (context) => generateAiObject({
      profileKey: EDITORIAL_SUMMARY_SCENARIO_KEY,
      messages: [
        { role: "system", content: EDITORIAL_SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ instruction: prompt, record: context }) },
      ],
      schema: EDITORIAL_SUMMARY_SCHEMA,
      validate: isEditorialSummaryResponse,
    }),
    save: saveGeneratedEditorialSummary,
  });
}
