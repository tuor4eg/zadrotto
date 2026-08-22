import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateAuthorQuizStatistics, formatQuizTimeRemaining, getQuizState, isQuizMediaTypeAllowed } from "../src/lib/quizzes/model";

describe("quizzes", () => {
  it("computes state with an exclusive end boundary", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    assert.equal(getQuizState({ enabled: false, startsAt: now, endsAt: new Date(now.getTime() + 1) }, now), "disabled");
    assert.equal(getQuizState({ enabled: true, startsAt: new Date(now.getTime() + 1), endsAt: new Date(now.getTime() + 2) }, now), "scheduled");
    assert.equal(getQuizState({ enabled: true, startsAt: now, endsAt: new Date(now.getTime() + 1) }, now), "active");
    assert.equal(getQuizState({ enabled: true, startsAt: new Date(now.getTime() - 1), endsAt: now }, now), "finished");
  });
  it("formats the remaining time with Russian plural forms", () => {
    const now = new Date("2026-08-22T10:00:00.000Z");
    assert.equal(
      formatQuizTimeRemaining(new Date("2026-08-24T11:02:00.000Z"), now),
      "Осталось 2 дня 1 час 2 минуты",
    );
    assert.equal(
      formatQuizTimeRemaining(new Date("2026-08-22T10:00:01.000Z"), now),
      "Осталось 0 дней 0 часов 1 минута",
    );
  });
  it("treats an empty media type selection as any type", () => {
    assert.equal(isQuizMediaTypeAllowed([], "film"), true);
    assert.equal(isQuizMediaTypeAllowed(["book"], "book"), true);
    assert.equal(isQuizMediaTypeAllowed(["book"], "film"), false);
  });
  it("calculates completed quiz statistics in chronological input order", () => {
    assert.deepEqual(calculateAuthorQuizStatistics([
      { outcome: "correct", attemptsRemaining: 3, attemptLimit: 3, isWinner: true },
      { outcome: "correct", attemptsRemaining: 1, attemptLimit: 3, isWinner: false },
      { outcome: "exhausted", attemptsRemaining: 0, attemptLimit: 3, isWinner: false },
      { outcome: "correct", attemptsRemaining: 2, attemptLimit: 3, isWinner: true },
    ]), {
      playedCount: 4,
      correctCount: 3,
      accuracyPercent: 75,
      firstTryCorrectCount: 1,
      currentCorrectStreak: 1,
      bestCorrectStreak: 2,
      winnerCount: 2,
    });
    assert.deepEqual(calculateAuthorQuizStatistics([]), {
      playedCount: 0,
      correctCount: 0,
      accuracyPercent: 0,
      firstTryCorrectCount: 0,
      currentCorrectStreak: 0,
      bestCorrectStreak: 0,
      winnerCount: 0,
    });
  });
  it("searches quiz answers by selected media types and shows Russian type names", () => {
    const picker = readFileSync("src/components/quizzes/quiz-answer-picker.tsx", "utf8");
    const form = readFileSync("src/app/admin/(protected)/quizzes/quiz-form.tsx", "utf8");
    const route = readFileSync("src/app/api/admin/quizzes/title-search/route.ts", "utf8");
    const query = readFileSync("src/db/queries/quizzes.ts", "utf8");

    assert.match(picker, /mediaTypeName\(item\.mediaType\)/);
    assert.match(picker, /Ничего не найдено/);
    assert.match(picker, /params\.append\("mediaType", mediaType\)/);
    assert.match(picker, /isQuizMediaTypeAllowed\(allowedMediaTypes, selected\.mediaType\)/);
    assert.match(picker, /setQuery\(""\)/);
    assert.match(form, /allowedMediaTypes=\{selectedMediaTypes\}/);
    assert.match(route, /searchParams\.getAll\("mediaType"\)/);
    assert.match(query, /inArray\(mediaItems\.mediaType, \[\.\.\.mediaTypeFilter\]\)/);
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
    const attemptsMigration = readFileSync("drizzle/0074_quiz_attempts.sql", "utf8");
    assert.match(attemptsMigration, /"attempt_limit" integer DEFAULT 3 NOT NULL/);
    assert.match(attemptsMigration, /quizzes_attempt_limit_check/);
    assert.match(attemptsMigration, /"attempts_remaining" integer DEFAULT 3 NOT NULL/);
    assert.match(attemptsMigration, /ALTER COLUMN "attempts_remaining" DROP DEFAULT/);
    assert.match(attemptsMigration, /quiz_participants_outcome_check/);
    assert.match(attemptsMigration, /quiz_participants_completion_check/);
    assert.match(attemptsMigration, /quiz_participants_attempt_state_check/);
    const winnersMigration = readFileSync("drizzle/0075_quiz_winners.sql", "utf8");
    assert.match(winnersMigration, /SELECT DISTINCT ON \("quiz_id"\)/);
    assert.match(winnersMigration, /ORDER BY "quiz_id", "completed_at" ASC, "author_id" ASC/);
    assert.match(winnersMigration, /quiz_participants_winner_check/);
    assert.match(winnersMigration, /CREATE UNIQUE INDEX "quiz_participants_one_winner_idx"[\s\S]*WHERE "is_winner" = true/);
  });
  it("uses a shared archive context", () => {
    const page = readFileSync("src/app/archive/page.tsx", "utf8"); const catalog = readFileSync("src/app/media-items-catalog.tsx", "utf8");
    assert.match(page, /getActiveQuizParticipantState\(currentAuthor\.id\)/); assert.match(page, /activeQuiz=\{/); assert.doesNotMatch(catalog, /getActiveQuiz|db\./);
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
    assert.match(sharedHeader, /archive-catalog-controls-row[\s\S]*hidden[^\"]*lg:block[\s\S]*quizAction/);
    assert.match(sharedHeader, /archive-catalog-header-actions[\s\S]*lg:hidden[\s\S]*quizAction/);
    assert.match(sharedHeader, /<QuizModal/);
    assert.match(modal, /<ActiveQuizPanel/);
    assert.match(modal, /isRulesOpen[\s\S]*Правила викторины/);
    assert.match(modal, /Открыть правила викторины/);
    assert.match(modal, /aria-label=\{isRulesOpen \? "Назад к викторине"[\s\S]*<ArrowLeft/);
    assert.match(modal, /left-2 top-2 z-10[\s\S]*sm:left-3 sm:top-3[\s\S]*style=\{\{ position: "absolute" \}\}/);
    assert.match(modal, /right-2 top-2 z-10[\s\S]*sm:right-3 sm:top-3[\s\S]*aria-label="Закрыть викторину"/);
    assert.match(modal, /Неверный ответ отнимает одну попытку/);
  });
  it("persists and exposes atomic quiz attempt state", () => {
    const query = readFileSync("src/db/queries/quizzes.ts", "utf8");
    const actions = readFileSync("src/app/admin/(protected)/quizzes/actions.ts", "utf8");
    const participationRoute = readFileSync("src/app/api/quizzes/active/participation/route.ts", "utf8");
    const statusRoute = readFileSync("src/app/api/quizzes/active/status/route.ts", "utf8");
    const guessRoute = readFileSync("src/app/quiz/guess/route.ts", "utf8");

    assert.match(actions, /attemptLimit < 1 \|\| attemptLimit > 10/);
    assert.match(query, /attempt-limit-locked/);
    assert.match(query, /attemptsRemaining: active\.attemptLimit/);
    assert.match(query, /\.for\("update"\)/);
    assert.match(query, /participant\.attemptsRemaining - 1/);
    assert.match(query, /attemptsRemaining === 0 \? "exhausted"/);
    assert.match(query, /correct \? "correct"/);
    assert.match(participationRoute, /Response\.json\(\{ participant \}\)/);
    assert.match(statusRoute, /getActiveQuizParticipantState\(author\.id\)/);
    assert.match(guessRoute, /correct: result\.correct, participant: result\.participant/);
    assert.match(guessRoute, /result\.kind === "completed"[\s\S]*status: 409/);
  });
  it("assigns one winner under the quiz lock and loads completed author statistics", () => {
    const query = readFileSync("src/db/queries/quizzes.ts", "utf8");
    const guess = query.slice(query.indexOf("export async function checkQuizGuess"), query.indexOf("export async function searchQuizAnswerTitles"));
    const quizLock = guess.indexOf("from(quizzes)");
    const participantLock = guess.indexOf("from(quizParticipants)");
    assert.ok(quizLock >= 0 && participantLock > quizLock);
    assert.match(guess, /from\(quizzes\)[\s\S]*\.for\("update"\)[\s\S]*from\(quizParticipants\)[\s\S]*\.for\("update"\)/);
    assert.match(guess, /eq\(quizParticipants\.isWinner, true\)/);
    assert.match(guess, /isWinner: correct && !existingWinner/);
    assert.match(guess, /runInDomainEventTransaction[\s\S]*if \(outcome\) \{[\s\S]*type: "quiz\.completed"/);
    assert.match(guess, /aggregateId: `\$\{quiz\.id\}:\$\{authorId\}`/);
    assert.match(guess, /payload: \{ authorId, outcome, quizId: quiz\.id \}/);
    assert.match(query, /getAuthorQuizStatistics[\s\S]*isNotNull\(quizParticipants\.completedAt\)[\s\S]*orderBy\(asc\(quizParticipants\.completedAt\), asc\(quizParticipants\.quizId\)\)/);
  });
  it("renders quiz lives in the shared public external-interface layer", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const layer = readFileSync("src/components/external-interface/external-interface-layer.tsx", "utf8");
    const participationButton = readFileSync("src/components/quizzes/quiz-participation-button.tsx", "utf8");
    const guessButton = readFileSync("src/components/quizzes/quiz-guess-button.tsx", "utf8");
    const preview = readFileSync("src/app/media-catalog-preview.tsx", "utf8");

    assert.match(layout, /<ExternalInterfaceLayer>/);
    assert.match(layer, /\/api\/quizzes\/active\/status/);
    assert.match(layer, /isAdminRoute/);
    assert.match(layer, /quizParticipant && !quizParticipant\.completed/);
    assert.match(layer, /\(\) => \(\{ quizParticipant, setQuizParticipant \}\)/);
    assert.match(layer, /requestGenerationRef\.current === requestGeneration/);
    assert.match(layer, /Осталось попыток:/);
    assert.match(layer, /bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\][\s\S]*sm:top-\[max\(0\.75rem,env\(safe-area-inset-top\)\)\]/);
    assert.match(layer, /Array\.from\(\{ length: visibleParticipant\.attemptLimit \}/);
    assert.match(participationButton, /setQuizParticipant/);
    assert.match(guessButton, /setQuizParticipant/);
    assert.match(guessButton, /data\.correct \|\| data\.participant\?\.outcome === "exhausted"/);
    assert.match(guessButton, /<QuizGuessResultModal result=\{result\}/);
    assert.match(guessButton, /quizParticipant\?\.completed === true/);
    assert.match(guessButton, /isQuizCompleted \? null/);
    assert.match(guessButton, /role="dialog"/);
    assert.match(guessButton, /Верно!/);
    assert.match(guessButton, /Попытки закончились/);
    assert.match(guessButton, /src="\/mascot\/deadz_quiz_fail\.png"/);
    assert.match(guessButton, /data\.participant\?\.isWinner \? "winner" : "correct"/);
    assert.match(guessButton, /src="\/mascot\/deadz_quiz_win\.png"/);
    assert.match(guessButton, /src="\/mascot\/deadz_quiz_correct\.png"/);
    assert.match(guessButton, /AUTHOR_RATING_TONE_CLASS_NAMES\.good/);
    assert.doesNotMatch(guessButton, /ArchiveTooltip/);
    assert.match(guessButton, /variant === "preview" \? "w-full"/);
    assert.match(preview, /<AuthorMediaStatusControls[\s\S]*<QuizGuessButton titleId=\{item\.id\} variant="preview"/);
    assert.match(guessButton, /setTimeout\([\s\S]*3_000/);
    assert.match(guessButton, /disabled=\{pending \|\| cooldown\}/);
    assert.match(guessButton, /text: response\.ok \? "Неверно"/);
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
