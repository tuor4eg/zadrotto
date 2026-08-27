import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { quizQuestionTemplates } from "@/db/schema";

export type QuizQuestionTemplateInput = {
  name: string;
  question: string;
};

function normalizeQuizQuestionTemplateInput(input: QuizQuestionTemplateInput) {
  const name = input.name.trim();
  const question = input.question.trim();
  if (!name || !question) throw new Error("invalid-quiz-question-template");

  return { name, question };
}

export async function getQuizQuestionTemplates() {
  return db
    .select({
      createdAt: quizQuestionTemplates.createdAt,
      id: quizQuestionTemplates.id,
      name: quizQuestionTemplates.name,
      question: quizQuestionTemplates.question,
      updatedAt: quizQuestionTemplates.updatedAt,
    })
    .from(quizQuestionTemplates)
    .orderBy(asc(quizQuestionTemplates.name), asc(quizQuestionTemplates.id));
}

export async function createQuizQuestionTemplate(input: QuizQuestionTemplateInput) {
  const [template] = await db
    .insert(quizQuestionTemplates)
    .values(normalizeQuizQuestionTemplateInput(input))
    .returning();

  return template!;
}

export async function updateQuizQuestionTemplate(
  id: number,
  input: QuizQuestionTemplateInput,
) {
  const [template] = await db
    .update(quizQuestionTemplates)
    .set({ ...normalizeQuizQuestionTemplateInput(input), updatedAt: new Date() })
    .where(eq(quizQuestionTemplates.id, id))
    .returning();

  return template ?? null;
}

export async function deleteQuizQuestionTemplate(id: number) {
  const [template] = await db
    .delete(quizQuestionTemplates)
    .where(eq(quizQuestionTemplates.id, id))
    .returning();

  return template ?? null;
}
