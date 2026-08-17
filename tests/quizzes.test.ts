import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    const participantsMigration = readFileSync("drizzle/0064_quiz_participants.sql", "utf8");
    assert.match(migration, /quizzes_period_check/); assert.match(migration, /quizzes_content_check/);
    assert.match(migration, /PRIMARY KEY\("quiz_id", "media_type"\)/); assert.match(migration, /quizzes_active_idx/);
    assert.match(migration, /quiz_media_types_media_type_idx/);
    assert.match(participantsMigration, /PRIMARY KEY\("quiz_id", "author_id"\)/);
    assert.match(participantsMigration, /quiz_participants_author_id_idx/);
    assert.match(participantsMigration, /ON DELETE cascade/);
  });
  it("uses a shared archive context", () => {
    const page = readFileSync("src/app/archive/page.tsx", "utf8"); const catalog = readFileSync("src/app/media-items-catalog.tsx", "utf8");
    assert.match(page, /isQuizParticipant\(activeQuiz\.id, currentAuthor\.id\)/); assert.match(page, /activeQuiz=\{/); assert.doesNotMatch(catalog, /getActiveQuiz|db\./);
  });
  it("keeps participation independent from the quiz presentation route", () => {
    const query = readFileSync("src/db/queries/quizzes.ts", "utf8");
    const participationRoute = readFileSync("src/app/api/quizzes/active/participation/route.ts", "utf8");
    const guessRoute = readFileSync("src/app/quiz/guess/route.ts", "utf8");
    const header = readFileSync("src/app/catalog-sticky-header.tsx", "utf8");
    const modal = readFileSync("src/components/quizzes/quiz-modal.tsx", "utf8");

    assert.match(query, /insert\(quizParticipants\)[\s\S]*onConflictDoNothing\(\)/);
    assert.match(participationRoute, /joinActiveQuiz\(author\.id\)/);
    assert.match(guessRoute, /checkQuizGuess\(Number\(titleId\), author\.id\)/);
    assert.match(guessRoute, /result\.kind === "not-participant"[\s\S]*status: 403/);
    assert.equal(existsSync("src/app/quiz/page.tsx"), false);
    const sharedHeader = readFileSync("src/components/archive/archive-site-header.tsx", "utf8");
    const mainPage = readFileSync("src/app/page.tsx", "utf8");
    assert.match(header, /quiz=\{activeQuiz/);
    assert.match(mainPage, /quiz=\{activeQuiz/);
    assert.match(sharedHeader, /archive-catalog-controls-row[\s\S]*hidden lg:block[\s\S]*quizAction/);
    assert.match(sharedHeader, /archive-catalog-header-actions[\s\S]*lg:hidden[\s\S]*quizAction/);
    assert.match(sharedHeader, /<QuizModal/);
    assert.match(modal, /<ActiveQuizPanel/);
  });
  it("proxies production quiz images through the protected nginx location", () => {
    const route = readFileSync("src/app/quiz-images/[...objectKey]/route.ts", "utf8");
    const nginx = readFileSync("deploy/nginx/zadrotto.conf", "utf8");

    assert.match(route, /"X-Accel-Redirect": `\/_quiz-images\//);
    assert.match(nginx, /location \^~ \/_quiz-images\/ \{[\s\S]*?internal;[\s\S]*?proxy_pass/);
  });
  it("loads protected quiz previews in the browser instead of the cookie-less image optimizer", () => {
    const picker = readFileSync("src/components/achievements/achievement-image-picker.tsx", "utf8");

    assert.match(picker, /src=\{previewUrl\} unoptimized/);
  });
});
