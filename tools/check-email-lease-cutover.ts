import "dotenv/config";

async function main() {
  const { getDbClient } = await import("../src/db");
  const { getEmailLeaseCutoverReport } = await import("../src/db/queries/email-outbox");
  try {
    const report = await getEmailLeaseCutoverReport();
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (!report.ready) process.exitCode = 1;
  } finally {
    await getDbClient().end();
  }
}

main().catch(() => {
  // Connection errors may include credentials or connection URLs.
  console.error("Email lease preflight unavailable; cutover readiness is unconfirmed.");
  process.exitCode = 1;
});
