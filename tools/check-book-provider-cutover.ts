import "dotenv/config";
import { parseBookProviders } from "../src/lib/providers/book-cutover";

async function main() {
  const providers = parseBookProviders(process.argv.slice(2).join(",") || "fantlab,google-books,open-library");
  const { auditNormalizedBookCutover } = await import("../src/lib/providers/book-cutover-check");
  const { getDbClient } = await import("../src/db");
  try {
    const reports = await auditNormalizedBookCutover(providers);
    process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
    if (reports.some((report) => !report.ready)) process.exitCode = 1;
  } finally { await getDbClient().end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
