import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sourceRoot = "src";
const nextConfigSource = readFileSync("next.config.ts", "utf8");
const routeFiles = [
  "src/app/series/[code]/page.tsx",
  "src/app/author/(protected)/series/page.tsx",
  "src/app/admin/(protected)/series/page.tsx",
];

function getSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return getSourceFiles(entryPath);
    }

    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

test("series routes replace franchises in public, author, and admin URLs", () => {
  for (const routeFile of routeFiles) {
    assert.equal(existsSync(routeFile), true, `Missing series route: ${routeFile}`);
  }

  const staleUrlPattern = /["'`]\/(?:admin\/|author\/)?franchises(?:[/?#"'`]|\$\{)/;
  const staleUrlFiles = getSourceFiles(sourceRoot).filter((file) =>
    staleUrlPattern.test(readFileSync(file, "utf8")),
  );

  assert.deepEqual(
    staleUrlFiles,
    [],
    `Stale /franchises URL segment found in: ${staleUrlFiles.join(", ")}`,
  );
});

test("legacy franchises URLs redirect to series URLs", () => {
  assert.match(nextConfigSource, /source: "\/franchises\/:path\*"/);
  assert.match(nextConfigSource, /destination: "\/series\/:path\*"/);
  assert.match(nextConfigSource, /source: "\/author\/franchises\/:path\*"/);
  assert.match(nextConfigSource, /destination: "\/author\/series\/:path\*"/);
  assert.match(nextConfigSource, /source: "\/admin\/franchises\/:path\*"/);
  assert.match(nextConfigSource, /destination: "\/admin\/series\/:path\*"/);
});
