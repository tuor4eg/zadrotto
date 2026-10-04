import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decideAnimeShikimoriBackfill,
  needsAnimeShikimoriEnrichment,
  runAnimeShikimoriBackfill,
} from "@/lib/media/anime-shikimori-backfill-core";
import { classifyDescriptionLanguage } from "@/lib/media/anime-shikimori-language";

describe("conservative anime description language", () => {
  it("classifies only confident empty, Russian, and English descriptions", () => {
    assert.equal(classifyDescriptionLanguage("   "), "empty");
    assert.equal(
      classifyDescriptionLanguage("Это русское описание сериала Attack on Titan с латинским названием внутри."),
      "russian",
    );
    assert.equal(
      classifyDescriptionLanguage("This is a clearly English description with enough Latin letters."),
      "english",
    );
  });

  it("preserves mixed, short, and unclear descriptions", () => {
    assert.equal(classifyDescriptionLanguage("Русский text mixed примерно equally between scripts"), "unknown");
    assert.equal(classifyDescriptionLanguage("Коротко"), "unknown");
    assert.equal(classifyDescriptionLanguage("1234 — !!!"), "unknown");
  });
});

describe("anime Shikimori backfill decisions", () => {
  const base = {
    description: null,
    maxTitleAliases: 3,
    originalTitle: "Shingeki no Kyojin",
    shikimoriDescription: "Русское описание с достаточным количеством кириллических букв.",
    shikimoriRussian: "Атака титанов",
    title: "Attack on Titan",
  };

  it("refreshes Russian markup once and preserves it on an empty response", () => {
    const description = "Рэйчел [character=175893]Рахиль[/character] встретила героя.";
    const aliases = ["Русское название"];
    assert.equal(needsAnimeShikimoriEnrichment({ aliases, description }), true);
    const first = decideAnimeShikimoriBackfill({ ...base, aliases, description });
    assert.equal(first.description, base.shikimoriDescription);
    assert.equal(needsAnimeShikimoriEnrichment(first), false);
    assert.deepEqual(decideAnimeShikimoriBackfill({ ...base, ...first }), first);
    assert.equal(decideAnimeShikimoriBackfill({ ...base, aliases, description, shikimoriDescription: null }).description, description);
  });

  it("adds Russian data once and stays idempotent", () => {
    const first = decideAnimeShikimoriBackfill({ ...base, aliases: ["進撃の巨人"] });
    assert.deepEqual(first, {
      aliases: ["進撃の巨人", "Атака титанов"],
      description: base.shikimoriDescription,
    });
    assert.deepEqual(
      decideAnimeShikimoriBackfill({ ...base, aliases: first.aliases, description: first.description }),
      first,
    );
  });

  it("keeps aliases when any Cyrillic alias exists and rejects duplicates", () => {
    assert.deepEqual(
      decideAnimeShikimoriBackfill({ ...base, aliases: ["Атака титанов"] }).aliases,
      ["Атака титанов"],
    );
    assert.deepEqual(
      decideAnimeShikimoriBackfill({
        ...base,
        aliases: ["Attack on Titan"],
        shikimoriRussian: "Attack on Titan",
      }).aliases,
      ["Attack on Titan"],
    );
  });

  it("replaces the last alias at the configured limit", () => {
    assert.deepEqual(
      decideAnimeShikimoriBackfill({ ...base, aliases: ["First", "Second", "Third"] }).aliases,
      ["First", "Second", "Атака титанов"],
    );
  });

  it("replaces empty and English descriptions but preserves Russian and unclear text", () => {
    const russian = "Это уже русское описание с достаточным количеством кириллических букв.";
    const mixed = "Русский text mixed примерно equally between scripts";
    assert.equal(decideAnimeShikimoriBackfill({ ...base, aliases: [], description: null }).description, base.shikimoriDescription);
    assert.equal(decideAnimeShikimoriBackfill({
      ...base,
      aliases: [],
      description: "This is an existing English description with enough Latin letters.",
    }).description, base.shikimoriDescription);
    assert.equal(decideAnimeShikimoriBackfill({ ...base, aliases: [], description: russian }).description, russian);
    assert.equal(decideAnimeShikimoriBackfill({ ...base, aliases: [], description: mixed }).description, mixed);
  });
});

describe("anime Shikimori backfill run", () => {
  const item = (id: number, overrides: Partial<{
    aliases: string[];
    description: string | null;
    sourceExternalId: string;
  }> = {}) => ({
    aliases: [],
    description: null,
    id,
    originalTitle: null,
    sourceExternalId: String(id * 10),
    title: `Anime ${id}`,
    ...overrides,
  });

  it("skips completed rows and performs exactly one lookup", async () => {
    const marked: number[] = [];
    const fetched: number[] = [];
    const applied: number[] = [];
    const result = await runAnimeShikimoriBackfill({
      maxTitleAliases: 3,
      getItems: async () => [
        item(1, {
          aliases: ["Русское название"],
          description: "Это русское описание с достаточным количеством кириллических букв.",
        }),
        item(2),
        item(3),
      ],
      markSkipped: async ({ mediaItemId }) => { marked.push(mediaItemId); return true; },
      fetchEnrichment: async (id) => {
        fetched.push(id);
        return { kind: "terminal", status: "enriched", russian: "Русское аниме", description: null };
      },
      applyResult: async ({ mediaItemId }) => {
        applied.push(mediaItemId);
        return true;
      },
    });

    assert.deepEqual(marked, [1]);
    assert.deepEqual(fetched, [20]);
    assert.deepEqual(applied, [2]);
    assert.deepEqual(result, { attemptedLookup: true, updated: true });
  });

  it("does not mark a skipped row when a concurrent edit makes it eligible", async () => {
    const fetched: number[] = [];
    await runAnimeShikimoriBackfill({
      maxTitleAliases: 3,
      getItems: async () => [item(1, {
        aliases: ["Русское название"],
        description: "Это русское описание с достаточным количеством кириллических букв.",
      })],
      markSkipped: async ({ shouldMark }) => shouldMark({
        aliases: [],
        description: null,
        id: 1,
        originalTitle: null,
        title: "Anime 1",
      }),
      fetchEnrichment: async (id) => {
        fetched.push(id);
        return { kind: "terminal", status: "not-found", russian: null, description: null };
      },
      applyResult: async () => true,
    });

    assert.deepEqual(fetched, [10]);
  });

  it("does not mark or apply a transient provider failure", async () => {
    let applied = false;
    const result = await runAnimeShikimoriBackfill({
      maxTitleAliases: 3,
      getItems: async () => [item(1)],
      markSkipped: async () => { throw new Error("must not mark"); },
      fetchEnrichment: async () => ({ kind: "transient-error" }),
      applyResult: async () => { applied = true; return true; },
    });

    assert.equal(applied, false);
    assert.deepEqual(result, { attemptedLookup: true, updated: false });
  });

  it("rechecks current data inside applyResult before updating", async () => {
    let decision: ReturnType<Parameters<Parameters<typeof runAnimeShikimoriBackfill>[0]["applyResult"]>[0]["decide"]> | null = null;
    await runAnimeShikimoriBackfill({
      maxTitleAliases: 3,
      getItems: async () => [item(1)],
      markSkipped: async () => true,
      fetchEnrichment: async () => ({
        kind: "terminal",
        status: "enriched",
        russian: "Новое русское название",
        description: "Новое русское описание с достаточным количеством кириллических букв.",
      }),
      applyResult: async ({ decide }) => {
        decision = decide({
          aliases: [{ id: 1, value: "Ручной русский alias" }],
          description: "Ручное русское описание с достаточным количеством кириллических букв.",
          id: 1,
          originalTitle: null,
          title: "Anime 1",
        });
        return true;
      },
    });

    assert.deepEqual(decision, {
      aliases: ["Ручной русский alias"],
      description: "Ручное русское описание с достаточным количеством кириллических букв.",
    });
  });

  it("becomes a no-op after all candidates are processed", async () => {
    assert.deepEqual(await runAnimeShikimoriBackfill({
      maxTitleAliases: 3,
      getItems: async () => [],
      markSkipped: async () => true,
      fetchEnrichment: async () => { throw new Error("must not fetch"); },
      applyResult: async () => { throw new Error("must not apply"); },
    }), { attemptedLookup: false, updated: false });
  });
});

describe("anime Shikimori backfill wiring", () => {
  it("registers a minute schedule and selects only stored AniList sources", () => {
    const migration = readFileSync("drizzle/0096_anime_shikimori_backfill.sql", "utf8");
    const query = readFileSync("src/db/queries/anime-shikimori-backfill.ts", "utf8");
    const handlers = readFileSync("src/lib/jobs/handlers.ts", "utf8");

    assert.match(migration, /'media\.anime-shikimori-backfill'[\s\S]*'\* \* \* \* \*'/);
    assert.match(migration, /"max_attempts"[\s\S]*\n\s*1,/);
    assert.match(migration, /job_runs_anime_shikimori_backfill_active_unique/);
    assert.match(query, /eq\(mediaItemMetadata\.sourceProvider, "anilist"\)/);
    assert.match(query, /isNull\(mediaItems\.shikimoriEnrichmentAttemptedAt\)/);
    assert.match(handlers, /type: "media\.anime-shikimori-backfill"/);
    assert.match(handlers, /defaultMaxAttempts: 1/);
  });
});
