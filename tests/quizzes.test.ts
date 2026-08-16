import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getQuizState, isQuizMediaTypeAllowed } from "../src/lib/quizzes/model";

describe("quizzes", () => {
  it("computes state with an exclusive end boundary", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    assert.equal(getQuizState({ enabled: false, startsAt: now, endsAt: new Date(now.getTime() + 1) }, now), "disabled");
    assert.equal(getQuizState({ enabled: true, startsAt: new Date(now.getTime() + 1), endsAt: new Date(now.getTime() + 2) }, now), "scheduled");
    assert.equal(getQuizState({ enabled: true, startsAt: now, endsAt: new Date(now.getTime() + 1) }, now), "active");
    assert.equal(getQuizState({ enabled: true, startsAt: new Date(now.getTime() - 1), endsAt: now }, now), "finished");
  });
  it("treats an empty media type selection as any type", () => {
    assert.equal(isQuizMediaTypeAllowed([], "film"), true);
    assert.equal(isQuizMediaTypeAllowed(["book"], "book"), true);
    assert.equal(isQuizMediaTypeAllowed(["book"], "film"), false);
  });
  it("keeps answer id out of public DTO", () => {
    const source = readFileSync("src/db/queries/quizzes.ts", "utf8");
    const section = source.slice(source.indexOf("export async function getActiveQuiz"), source.indexOf("export async function checkQuizGuess"));
    assert.doesNotMatch(section, /answerMediaItemId/);
  });
  it("has migration constraints and indexes", () => {
    const migration = readFileSync("drizzle/0063_quizzes.sql", "utf8");
    assert.match(migration, /quizzes_period_check/); assert.match(migration, /quizzes_content_check/);
    assert.match(migration, /PRIMARY KEY\("quiz_id", "media_type"\)/); assert.match(migration, /quizzes_active_idx/);
    assert.match(migration, /quiz_media_types_media_type_idx/);
  });
  it("uses a shared archive context", () => {
    const page = readFileSync("src/app/archive/page.tsx", "utf8"); const catalog = readFileSync("src/app/media-items-catalog.tsx", "utf8");
    assert.match(page, /getActiveQuiz\(\)/); assert.match(page, /activeQuiz=\{/); assert.doesNotMatch(catalog, /getActiveQuiz|db\./);
  });
});
