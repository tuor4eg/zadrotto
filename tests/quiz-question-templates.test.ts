import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getActivityActionLabel,
  getActivityEntityTypeLabel,
} from "@/lib/activity-logs/model";

describe("quiz question templates", () => {
  it("defines an independent case-sensitive template catalog in schema and migration", () => {
    const migration = readFileSync("drizzle/0078_quiz_question_templates.sql", "utf8");
    const journal = readFileSync("drizzle/meta/_journal.json", "utf8");
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const quizzesSchema = schema.slice(
      schema.indexOf("export const quizzes"),
      schema.indexOf("export const quizQuestionTemplates"),
    );

    assert.match(migration, /CREATE TABLE "quiz_question_templates"/);
    assert.match(migration, /"id" serial PRIMARY KEY/);
    assert.match(migration, /CONSTRAINT "quiz_question_templates_name_unique" UNIQUE\("name"\)/);
    assert.match(migration, /btrim\("name"\) <> ''/);
    assert.match(migration, /btrim\("question"\) <> ''/);
    assert.doesNotMatch(migration, /lower\(/);
    assert.match(journal, /"idx": 78[\s\S]*"tag": "0078_quiz_question_templates"/);
    assert.match(schema, /export const quizQuestionTemplates = pgTable\([\s\S]*"quiz_question_templates"/);
    assert.doesNotMatch(quizzesSchema, /template/i);
  });

  it("keeps CRUD in a dedicated query module with normalized input and stable sorting", () => {
    const query = readFileSync("src/db/queries/quiz-question-templates.ts", "utf8");

    assert.match(query, /input\.name\.trim\(\)/);
    assert.match(query, /input\.question\.trim\(\)/);
    assert.match(query, /orderBy\(asc\(quizQuestionTemplates\.name\), asc\(quizQuestionTemplates\.id\)\)/);
    assert.match(query, /export async function createQuizQuestionTemplate[\s\S]*insert\(quizQuestionTemplates\)/);
    assert.match(query, /export async function updateQuizQuestionTemplate[\s\S]*update\(quizQuestionTemplates\)/);
    assert.match(query, /export async function deleteQuizQuestionTemplate[\s\S]*delete\(quizQuestionTemplates\)/);
  });

  it("provides responsive settings CRUD and friendly duplicate-name feedback", () => {
    const page = readFileSync("src/app/admin/(protected)/settings/quizzes/page.tsx", "utf8");
    const manager = readFileSync(
      "src/app/admin/(protected)/settings/quizzes/quiz-question-templates-manager.tsx",
      "utf8",
    );
    const actions = readFileSync("src/app/admin/(protected)/settings/quizzes/actions.ts", "utf8");
    const nav = readFileSync("src/app/admin/(protected)/settings/settings-nav.tsx", "utf8");

    assert.match(nav, /href: "\/admin\/settings\/quizzes"[\s\S]*label: "Викторины"/);
    assert.match(page, /<QuizQuestionTemplatesManager templates=\{templates\}/);
    assert.match(manager, /grid gap-3 md:hidden/);
    assert.match(manager, /<TableWrap className="hidden md:block">/);
    assert.match(manager, /Новый шаблон/);
    assert.match(manager, /aria-label="Изменить"[\s\S]*size="icon"/);
    assert.match(manager, /<Tooltip label="Изменить">/);
    assert.match(manager, /<Tooltip label="Удалить">/);
    assert.match(manager, /role="dialog"/);
    assert.match(manager, /template \? updateQuizQuestionTemplateAction : createQuizQuestionTemplateAction/);
    assert.match(manager, /action=\{deleteQuizQuestionTemplateAction\}/);
    assert.match(manager, /Шаблонов вопросов пока нет/);
    assert.doesNotMatch(manager, /<input[^>]+defaultValue=\{template\.name\}[^>]+form=/);
    assert.match(page, /Шаблон с таким названием уже существует/);
    assert.match(actions, /isUniqueViolation\(error\)[\s\S]*error=duplicate-name/g);
  });

  it("logs create, update, and delete as a dedicated activity entity", () => {
    const actions = readFileSync("src/app/admin/(protected)/settings/quizzes/actions.ts", "utf8");

    assert.equal(getActivityEntityTypeLabel("quiz-question-template"), "Шаблон вопроса викторины");
    assert.equal(getActivityActionLabel("quiz-question-template.created"), "Шаблон вопроса викторины создан");
    assert.equal(getActivityActionLabel("quiz-question-template.updated"), "Шаблон вопроса викторины изменён");
    assert.equal(getActivityActionLabel("quiz-question-template.deleted"), "Шаблон вопроса викторины удалён");
    assert.match(actions, /action: "quiz-question-template\.created"[\s\S]*entityType: "quiz-question-template"/);
    assert.match(actions, /action: "quiz-question-template\.updated"[\s\S]*entityType: "quiz-question-template"/);
    assert.match(actions, /action: "quiz-question-template\.deleted"[\s\S]*entityType: "quiz-question-template"/);
  });

  it("copies a selected template into the controlled create and edit question forms", () => {
    const form = readFileSync("src/app/admin/(protected)/quizzes/quiz-form.tsx", "utf8");
    const newPage = readFileSync("src/app/admin/(protected)/quizzes/new/page.tsx", "utf8");
    const editPage = readFileSync("src/app/admin/(protected)/quizzes/[id]/edit/page.tsx", "utf8");

    assert.match(newPage, /getQuizQuestionTemplates\(\)/);
    assert.match(newPage, /questionTemplates=\{questionTemplates\}/);
    assert.match(editPage, /getQuizQuestionTemplates\(\)/);
    assert.match(editPage, /questionTemplates=\{questionTemplates\}/);
    assert.match(form, /id="questionTemplate"/);
    assert.match(form, /disabled=\{questionTemplates\.length === 0\}/);
    assert.match(form, /<option value="">Без шаблона<\/option>/);
    assert.match(form, /<ConfirmDialog[\s\S]*title="Заменить вопрос\?"/);
    assert.doesNotMatch(form, /window\.confirm/);
    assert.match(form, /setQuestion\(template\.question\)/);
    assert.match(form, /setSelectedTemplateId\(""\)[\s\S]*return/);
    assert.match(form, /name="question"[\s\S]*value=\{question\}/);
    assert.doesNotMatch(form, /name="(?:question)?[Tt]emplateId"/);
    assert.match(form, /href="\/admin\/settings\/quizzes"[\s\S]*Настроить шаблоны/);
  });
});
