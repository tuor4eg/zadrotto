import "dotenv/config";

import { dbClient } from "@/db";
import {
  getMediaItemsMissingCoverThumb,
  updateMediaItemCoverThumb,
} from "@/db/queries/cover-thumbs";
import {
  createAndUploadCoverThumbFromObjectKey,
  isS3ObjectKey,
} from "@/lib/covers/storage";

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
  let skipped = 0;
  let failed = 0;
  let updated = 0;

  console.log(
    `Found ${items.length} media item(s) without cover thumbnails${
      options.dryRun ? " (dry run)" : ""
    }.`,
  );

  for (const item of items) {
    if (!isS3ObjectKey(item.coverUrl)) {
      skipped += 1;
      console.log(`skip #${item.id}: cover is not an S3 object key`);
      continue;
    }

    if (options.dryRun) {
      console.log(`would backfill #${item.id}: ${item.title}`);
      continue;
    }

    try {
      const coverThumbUrl = await createAndUploadCoverThumbFromObjectKey(item.coverUrl);

      if (!coverThumbUrl) {
        failed += 1;
        console.log(`fail #${item.id}: thumbnail was not generated`);
        continue;
      }

      await updateMediaItemCoverThumb({
        mediaItemId: item.id,
        coverThumbUrl,
      });
      updated += 1;
      console.log(`ok #${item.id}: ${coverThumbUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`fail #${item.id}:`, error);
    }
  }

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
