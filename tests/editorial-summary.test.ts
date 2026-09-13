import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildEditorialSummaryContext,
  EDITORIAL_SUMMARY_SYSTEM_PROMPT,
  getEditorialSummarySourceHash,
  getGeneratedEditorialSummaryWrite,
  isEditorialSummaryResponse,
  isEditorialSummaryStale,
  prepareManualEditorialSummary,
  type EditorialSummarySource,
} from "../src/lib/media/editorial-summary";
import { runEditorialSummaryFlow } from "../src/lib/media/editorial-summary-flow";
import { getAdminEditorialSummaryState, parseAdminMediaSort } from "../src/lib/media/admin-editorial-summary";

const source: EditorialSummarySource = {
  title: "Пример",
  originalTitle: "Example",
  mediaType: "game",
  releaseYear: 2020,
  description: "История о путешествии по вымышленному миру.",
  metadataFacts: { genres: ["Приключение"], developers: ["Студия"], unrelated: "не используется" },
};
const description = "Это приключенческая игра о путешествии по вымышленному миру. Она сочетает исследование локаций с историей, созданной студией разработчиков.";

test("admin list distinguishes AI outcomes and accepts its private date sort", () => {
  const prompt = "Редакционная инструкция";
  const sourceHash = getEditorialSummarySourceHash(source, prompt);
  const summary = { source, sourceHash, prompt, locked: false };
  assert.equal(getAdminEditorialSummaryState({ ...summary, status: null }), "missing");
  assert.equal(getAdminEditorialSummaryState({ ...summary, status: "ready" }), "ready");
  assert.equal(getAdminEditorialSummaryState({ ...summary, status: "unusable" }), "unusable");
  assert.equal(getAdminEditorialSummaryState({ ...summary, status: "ready", prompt: "Новый prompt" }), "stale");
  assert.equal(getAdminEditorialSummaryState({ ...summary, status: "ready", locked: true, prompt: "Новый prompt" }), "locked");
  assert.equal(parseAdminMediaSort("editorial_attempted_at"), "editorial_attempted_at");
  assert.equal(parseAdminMediaSort("unknown"), "title");
});

test("production jobs worker receives AI credentials and Redis for summary generation", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const worker = compose.slice(compose.indexOf("  jobs-worker:"), compose.indexOf("\n  redis:"));
  assert.match(worker, /AI_PROVIDER_CREDENTIALS_KEY: \$\{AI_PROVIDER_CREDENTIALS_KEY\}/);
  assert.match(worker, /REDIS_URL: \$\{REDIS_URL:-redis:\/\/redis:6379\}/);
});

test("context selects relevant metadata and hash changes with source or prompt", () => {
  assert.deepEqual(buildEditorialSummaryContext(source).facts, {
    developers: ["Студия"], genres: ["Приключение"],
  });
  const hash = getEditorialSummarySourceHash(source, "Редакционная инструкция");
  assert.equal(hash, getEditorialSummarySourceHash({ ...source, metadataFacts: { unrelated: "другое", developers: ["Студия"], genres: ["Приключение"] } }, "Редакционная инструкция"));
  assert.notEqual(hash, getEditorialSummarySourceHash(source, "Новая инструкция"));
  assert.notEqual(hash, getEditorialSummarySourceHash({ ...source, description: "Новый текст" }, "Редакционная инструкция"));
  assert.notEqual(hash, getEditorialSummarySourceHash({ ...source, metadataFacts: { ...source.metadataFacts, genres: ["Экшен"] } }, "Редакционная инструкция"));
  assert.equal(isEditorialSummaryStale({ locked: false, sourceHash: hash, currentHash: hash }), false);
  assert.equal(isEditorialSummaryStale({ locked: false, sourceHash: hash, currentHash: "changed" }), true);
  assert.equal(isEditorialSummaryStale({ locked: true, sourceHash: hash, currentHash: "changed" }), false);
});

test("editorial prompt controls the tone while system prompt keeps factual constraints", () => {
  assert.match(EDITORIAL_SUMMARY_SYSTEM_PROMPT, /Тон и стиль задаёт редакционная инструкция/);
  assert.doesNotMatch(EDITORIAL_SUMMARY_SYSTEM_PROMPT, /Стиль нейтральный/);
  assert.match(EDITORIAL_SUMMARY_SYSTEM_PROMPT, /Не выдумывай факты/);
});

test("structured output accepts short Russian prose and rejects malformed answers", () => {
  assert.equal(isEditorialSummaryResponse({ description, usable: true }), true);
  assert.equal(isEditorialSummaryResponse({ description: "", usable: false }), true);
  assert.equal(isEditorialSummaryResponse({ description, usable: "true" }), false);
  assert.equal(isEditorialSummaryResponse({ description: "English description. Another sentence.", usable: true }), false);
  assert.equal(isEditorialSummaryResponse({ description: "а".repeat(401) + ".", usable: true }), false);
  assert.equal(isEditorialSummaryResponse({ description, usable: true, reason: "extra" }), false);
});

test("generation saves usable and unusable results; locked and current records skip AI", async () => {
  const saved: Array<{ description: string | null; sourceHash: string; modelId: string }> = [];
  let calls = 0;
  const run = (input: { locked: boolean; sourceHash: string | null; usable: boolean; force?: boolean }) =>
    runEditorialSummaryFlow({
      mediaItemId: 7,
      source: { ...source, locked: input.locked, sourceHash: input.sourceHash },
      prompt: "Редакционная инструкция",
      force: input.force,
      generate: async () => { calls++; return { value: input.usable ? { description, usable: true } : { description: "", usable: false }, modelId: "test-model" }; },
      save: async (result) => { saved.push(result); return true; },
    });
  const hash = getEditorialSummarySourceHash(source, "Редакционная инструкция");
  assert.equal(await run({ locked: true, sourceHash: null, usable: true }), "locked");
  assert.equal(await run({ locked: false, sourceHash: hash, usable: true }), "current");
  assert.equal(calls, 0);
  assert.equal(await run({ locked: false, sourceHash: null, usable: true }), "ready");
  assert.equal(saved.at(-1)?.description, description);
  assert.equal(saved.at(-1)?.modelId, "test-model");
  assert.equal(await run({ locked: false, sourceHash: null, usable: false }), "unusable");
  assert.equal(saved.at(-1)?.description, null);
  assert.equal(await run({ locked: false, sourceHash: hash, usable: true, force: true }), "ready");
  assert.equal(calls, 3);
});

test("manual editing locks the text and invalid responses are never saved", async () => {
  assert.deepEqual(prepareManualEditorialSummary("  Ручная справка.  "), {
    summary: "Ручная справка.", status: "ready", locked: true, sourceHash: null,
  });
  assert.throws(() => prepareManualEditorialSummary(" "));
  let saved = false;
  await assert.rejects(runEditorialSummaryFlow({
    mediaItemId: 7,
    source: { ...source, locked: false, sourceHash: null },
    prompt: "Редакционная инструкция",
    generate: async () => ({ value: { description: "Too short", usable: true }, modelId: "test" }),
    save: async () => { saved = true; return true; },
  }));
  assert.equal(saved, false);
  assert.equal(await runEditorialSummaryFlow({
    mediaItemId: 7,
    source: { ...source, locked: false, sourceHash: null },
    prompt: "Редакционная инструкция",
    generate: async () => ({ value: { description, usable: true }, modelId: "test" }),
    save: async () => false,
  }), "changed");
  assert.deepEqual(getGeneratedEditorialSummaryWrite({
    description: null,
    previousSummary: "Прежняя справка.",
    previousGeneratedAt: new Date("2026-01-01"),
    now: new Date("2026-02-01"),
  }), {
    summary: "Прежняя справка.",
    status: "unusable",
    generatedAt: new Date("2026-01-01"),
  });
});

test("deduplication is enforced by a partial unique index and conflict-safe enqueue", () => {
  const migration = readFileSync("drizzle/0086_media_item_editorial_summaries.sql", "utf8");
  const query = readFileSync("src/db/queries/editorial-summaries.ts", "utf8");
  assert.match(migration, /CREATE UNIQUE INDEX "job_runs_editorial_summary_active_unique"/);
  assert.match(migration, /"status" IN \('queued', 'running'\)/);
  assert.match(query, /onConflictDoNothing\(\)/);
});

test("public page prefers the editorial summary and keeps source description as fallback", () => {
  const page = readFileSync("src/app/media/[code]/page.tsx", "utf8");
  const query = readFileSync("src/db/queries/media-items.ts", "utf8");
  assert.match(page, /item=\{\{ \.\.\.item, description: item\.editorialSummary \?\? item\.description \}\}/);
  assert.match(page, /item\.editorialSummary \?\? item\.description \?\? formatMediaItemSummary\(item\)/);
  assert.match(query, /editorialSummary: mediaItemEditorialSummaries\.summary/);
});
