import "dotenv/config";

import { dbClient } from "@/db";
import { getMediaItemsMissingCoverThumb } from "@/db/queries/cover-thumbs";
import { backfillCoverThumbnails } from "@/lib/covers/thumbnail-backfill";

type CliOptions = {
  dryRun: boolean;
  limit?: number;
};

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--limit") {
      const value = args[index + 1];
      const limit = Number(value);

      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error("Usage: tsx tools/backfill-cover-thumbs.ts [--dry-run] [--limit N]");
      }

      options.limit = limit;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const items = await getMediaItemsMissingCoverThumb({ limit: options.limit });
  console.log(
    `Found ${items.length} media item(s) without cover thumbnails${
      options.dryRun ? " (dry run)" : ""
    }.`,
  );

  if (options.dryRun) {
    for (const item of items) console.log(`would backfill #${item.id}: ${item.title}`);
    return;
  }

  const { failed, skipped, updated } = await backfillCoverThumbnails({ limit: options.limit });

  console.log(`Done. updated=${updated} skipped=${skipped} failed=${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbClient.end();
  });
