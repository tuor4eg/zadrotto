import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

test("Creator snapshot form payload imports stay browser-safe", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    // Inspect emitted imports: type-only dependencies must not be treated as runtime code.
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { ...options, module: ts.ModuleKind.ESNext } }).outputText;
    for (const item of ts.preProcessFile(output).importedFiles) {
      assert.ok(item.fileName.startsWith(".") || item.fileName.startsWith("@/"), `Server/package import ${item.fileName} reached through ${file}`);
      const dependency = ts.resolveModuleName(item.fileName, file, options, ts.sys).resolvedModule;
      assert.ok(dependency, `Unresolved dependency ${item.fileName}`);
      visit(dependency.resolvedFileName);
    }
  }
  visit(resolve("src/lib/providers/snapshot-job-payload.ts"));
  visit(resolve("src/lib/providers/creator-profile-targets.ts"));
});
