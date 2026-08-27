"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createQuizQuestionTemplate,
  deleteQuizQuestionTemplate,
  updateQuizQuestionTemplate,
} from "@/db/queries/quiz-question-templates";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAdminFormErrorCode, isUniqueViolation } from "@/lib/common/app-error-messages";

const SETTINGS_PATH = "/admin/settings/quizzes";

function readTemplateInput(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();

  return name && question ? { name, question } : null;
}

function readTemplateId(formData: FormData) {
  const id = Number(formData.get("templateId"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidateTemplateSurfaces() {
  revalidatePath(SETTINGS_PATH);
  revalidatePath("/admin/quizzes/new");
}

export async function createQuizQuestionTemplateAction(formData: FormData) {
  const admin = await requireAdminUser();
  const input = readTemplateInput(formData);
  if (!input) redirect(`${SETTINGS_PATH}?error=invalid`);

  let template;
  try {
    template = await createQuizQuestionTemplate(input);
  } catch (error) {
    if (isUniqueViolation(error)) redirect(`${SETTINGS_PATH}?error=duplicate-name`);
    console.error("Не удалось создать шаблон вопроса викторины.", error);
    redirect(`${SETTINGS_PATH}?error=${getAdminFormErrorCode(error)}`);
  }

  await logActivity({
    action: "quiz-question-template.created",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz-question-template",
    entityId: template.id,
    entityLabel: template.name,
    message: "Шаблон вопроса викторины создан.",
  });
  revalidateTemplateSurfaces();
  redirect(`${SETTINGS_PATH}?created=1`);
}

export async function updateQuizQuestionTemplateAction(formData: FormData) {
  const admin = await requireAdminUser();
  const templateId = readTemplateId(formData);
  const input = readTemplateInput(formData);
  if (!templateId || !input) redirect(`${SETTINGS_PATH}?error=invalid`);

  let template;
  try {
    template = await updateQuizQuestionTemplate(templateId, input);
  } catch (error) {
    if (isUniqueViolation(error)) redirect(`${SETTINGS_PATH}?error=duplicate-name`);
    console.error("Не удалось изменить шаблон вопроса викторины.", error);
    redirect(`${SETTINGS_PATH}?error=${getAdminFormErrorCode(error)}`);
  }
  if (!template) redirect(`${SETTINGS_PATH}?error=missing`);

  await logActivity({
    action: "quiz-question-template.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz-question-template",
    entityId: template.id,
    entityLabel: template.name,
    message: "Шаблон вопроса викторины изменён.",
  });
  revalidateTemplateSurfaces();
  redirect(`${SETTINGS_PATH}?updated=1`);
}

export async function deleteQuizQuestionTemplateAction(formData: FormData) {
  const admin = await requireAdminUser();
  const templateId = readTemplateId(formData);
  if (!templateId) redirect(`${SETTINGS_PATH}?error=invalid`);

  let template;
  try {
    template = await deleteQuizQuestionTemplate(templateId);
  } catch (error) {
    console.error("Не удалось удалить шаблон вопроса викторины.", error);
    redirect(`${SETTINGS_PATH}?error=${getAdminFormErrorCode(error)}`);
  }
  if (!template) redirect(`${SETTINGS_PATH}?error=missing`);

  await logActivity({
    action: "quiz-question-template.deleted",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz-question-template",
    entityId: template.id,
    entityLabel: template.name,
    message: "Шаблон вопроса викторины удалён.",
  });
  revalidateTemplateSurfaces();
  redirect(`${SETTINGS_PATH}?deleted=1`);
}
