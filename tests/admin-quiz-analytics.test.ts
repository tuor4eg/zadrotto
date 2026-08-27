import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { clampPage, getTotalPages } from "@/lib/common/pagination";
import {
  ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE,
  calculateUsedQuizAttempts,
  formatQuizDuration,
  getAdminQuizParticipantStatus,
} from "@/lib/quizzes/admin-analytics";

describe("admin quiz analytics", () => {
  it("calculates used attempts for every participant outcome", () => {
    assert.equal(calculateUsedQuizAttempts({ attemptLimit: 3, attemptsRemaining: 3, outcome: "correct" }), 1);
    assert.equal(calculateUsedQuizAttempts({ attemptLimit: 3, attemptsRemaining: 1, outcome: "correct" }), 3);
    assert.equal(calculateUsedQuizAttempts({ attemptLimit: 3, attemptsRemaining: 0, outcome: "exhausted" }), 3);
    assert.equal(calculateUsedQuizAttempts({ attemptLimit: 3, attemptsRemaining: 2, outcome: null }), 1);
  });

  it("distinguishes winner, completed, answering, and not-started statuses", () => {
    assert.equal(getAdminQuizParticipantStatus({ attemptLimit: 3, attemptsRemaining: 3, isWinner: true, outcome: "correct" }), "winner");
    assert.equal(getAdminQuizParticipantStatus({ attemptLimit: 3, attemptsRemaining: 2, isWinner: false, outcome: "correct" }), "correct");
    assert.equal(getAdminQuizParticipantStatus({ attemptLimit: 3, attemptsRemaining: 0, isWinner: false, outcome: "exhausted" }), "exhausted");
    assert.equal(getAdminQuizParticipantStatus({ attemptLimit: 3, attemptsRemaining: 2, isWinner: false, outcome: null }), "answering");
    assert.equal(getAdminQuizParticipantStatus({ attemptLimit: 3, attemptsRemaining: 3, isWinner: false, outcome: null }), "not-started");
  });

  it("formats elapsed time and explicit empty values", () => {
    assert.equal(formatQuizDuration(null), "—");
    assert.equal(formatQuizDuration(0), "0 сек.");
    assert.equal(formatQuizDuration(65), "1 мин. 5 сек.");
    assert.equal(formatQuizDuration(90_061), "1 дн. 1 ч. 1 мин. 1 сек.");
  });

  it("uses a fixed page size and clamps excessive page numbers", () => {
    assert.equal(ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE, 50);
    const totalPages = getTotalPages(124, ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE);
    assert.equal(totalPages, 3);
    assert.equal(clampPage(999, totalPages), 3);
  });

  it("keeps context, aggregates, winner, and participant queries scoped to one quiz", () => {
    const source = readFileSync("src/db/queries/quizzes.ts", "utf8");
    const context = source.slice(
      source.indexOf("export async function getAdminQuizContext"),
      source.indexOf("export async function getAdminQuizAggregates"),
    );
    const aggregates = source.slice(
      source.indexOf("export async function getAdminQuizAggregates"),
      source.indexOf("export async function getAdminQuizWinner"),
    );
    const winner = source.slice(
      source.indexOf("export async function getAdminQuizWinner"),
      source.indexOf("export async function getAdminQuizParticipantPage"),
    );
    const participants = source.slice(
      source.indexOf("export async function getAdminQuizParticipantPage"),
      source.indexOf("async function assertInput"),
    );

    assert.match(context, /where\(eq\(quizzes\.id, quizId\)\)/);
    assert.match(aggregates, /where\(eq\(quizParticipants\.quizId, quizId\)\)/);
    assert.match(winner, /eq\(quizParticipants\.quizId, quizId\)/);
    assert.match(participants, /where\(eq\(quizParticipants\.quizId, input\.quizId\)\)/);
  });

  it("aggregates in SQL and sorts participants by outcome before pagination", () => {
    const source = readFileSync("src/db/queries/quizzes.ts", "utf8");
    const aggregates = source.slice(
      source.indexOf("export async function getAdminQuizAggregates"),
      source.indexOf("export async function getAdminQuizWinner"),
    );
    const participants = source.slice(
      source.indexOf("export async function getAdminQuizParticipantPage"),
      source.indexOf("async function assertInput"),
    );

    assert.match(aggregates, /count\(\*\) filter \(where \$\{quizParticipants\.outcome\} = 'correct'\)/);
    assert.match(aggregates, /avg\(extract\(epoch from/);
    assert.match(participants, /when \$\{quizParticipants\.isWinner\} then 0[\s\S]*when \$\{quizParticipants\.outcome\} = 'correct' then 1[\s\S]*when \$\{quizParticipants\.outcome\} = 'exhausted' then 2/);
    assert.match(participants, /asc\(quizParticipants\.completedAt\)/);
    assert.match(participants, /limit\(ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE\)[\s\S]*offset\(getOffset\(page, ADMIN_QUIZ_PARTICIPANT_PAGE_SIZE\)\)/);
  });

  it("renders the analytics page and links to it from the quiz list", () => {
    const page = readFileSync("src/app/admin/(protected)/quizzes/[id]/page.tsx", "utf8");
    const list = readFileSync("src/app/admin/(protected)/quizzes/page.tsx", "utf8");

    assert.match(list, /aria-label="Результаты"[\s\S]*href=\{`\/admin\/quizzes\/\$\{item\.id\}`\}/);
    assert.match(page, /getAdminQuizContext[\s\S]*getAdminQuizAggregates[\s\S]*getAdminQuizWinner/);
    assert.match(page, /Правильный ответ/);
    assert.match(page, /Среднее время правильного ответа/);
    assert.match(page, /Победитель/);
    assert.match(page, /От старта/);
    assert.match(page, /После входа/);
    assert.match(page, /className="grid gap-3 md:hidden"/);
    assert.match(page, /<TableWrap className="hidden md:block">/);
    assert.doesNotMatch(page, /min-w-\[1180px\]/);
    assert.match(page, /<PaginationNav[\s\S]*pageSize=\{participantsPage\.pageSize\}/);
  });
});
