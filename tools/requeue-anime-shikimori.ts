import "dotenv/config";

import { dbClient } from "@/db";
import {
  getAnimeShikimoriRequeueCandidates,
  requeueAnimeShikimoriItem,
} from "@/db/queries/anime-shikimori-backfill";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) {
    throw new Error("Usage: npm run anime:requeue-shikimori -- [--dry-run]");
  }
  const dryRun = args.includes("--dry-run");
  const candidates = await getAnimeShikimoriRequeueCandidates();
  console.log(`Candidates: ${candidates.length}${dryRun ? " (dry run)" : ""}`);

  let requeued = 0;
  for (const candidate of candidates) {
    if (dryRun) {
      console.log(`Would requeue #${candidate.id}`);
    } else if (await requeueAnimeShikimoriItem(candidate)) {
      requeued += 1;
    }
  }
  if (!dryRun) console.log(`Requeued: ${requeued}; skipped: ${candidates.length - requeued}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await dbClient.end();
});
