"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createQuiz,
  deleteQuiz,
  getAdminQuizById,
  setQuizEnabled,
  updateQuiz,
} from "@/db/queries/quizzes";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import {
  deleteQuizImageBestEffort,
  uploadQuizImage,
} from "@/lib/quizzes/images";

function parseQuizForm(form: FormData, imageObjectKey: string | null) {
  const question = String(form.get("question") ?? "").trim() || null;
  const comment = String(form.get("comment") ?? "").trim() || null;
  const answerMediaItemId = Number(form.get("answerMediaItemId"));
  const startsAt = new Date(String(form.get("startsAt") ?? ""));
  const endsAt = new Date(String(form.get("endsAt") ?? ""));
  const mediaTypes = [...new Set(form.getAll("mediaTypes").map(String).filter(Boolean))];
  const attemptLimit = Number(form.get("attemptLimit") ?? 3);

  if (!question && !imageObjectKey) throw new Error("content");
  if ((comment?.length ?? 0) > 2000) throw new Error("comment-length");
  if (!Number.isSafeInteger(answerMediaItemId) || answerMediaItemId <= 0) {
    throw new Error("answer");
  }
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    throw new Error("dates");
  }
  if (startsAt >= endsAt) throw new Error("period");
  if (!Number.isSafeInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > 10) {
    throw new Error("attempt-limit");
  }

  return {
    question,
    comment,
    imageObjectKey,
    answerMediaItemId,
    mediaTypes,
    startsAt,
    endsAt,
    attemptLimit,
    enabled: form.get("enabled") === "1",
  };
}

function getQuizSaveError(error: unknown) {
  if (error instanceof Error) {
    if (["content", "answer", "dates", "period", "attempt-limit", "attempt-limit-locked"].includes(error.message)) {
      return error.message;
    }
    if (error.message === "invalid-answer") return "answer-type";
    if (error.message === "invalid-quiz") return "invalid";
  }

  return "save";
}

export type QuizFormState = { error: string | null; submissionId: number };

const QUIZ_ERROR_MESSAGES: Record<string, string> = {
  answer: "Выберите правильную запись из результатов поиска.",
  "attempt-limit": "Количество попыток должно быть целым числом от 1 до 10.",
  "attempt-limit-locked": "Количество попыток нельзя изменить после присоединения первого участника.",
  "comment-length": "Комментарий должен быть не длиннее 2000 символов.",
  "answer-type": "Тип правильной записи должен входить в допустимые типы викторины.",
  content: "Добавьте текст вопроса или изображение.",
  dates: "Укажите корректные дату и время начала и окончания.",
  "image-invalid": "Не удалось обработать изображение. Используйте JPG, PNG или WebP.",
  "image-too-large": "Изображение должно быть не больше 5 МБ.",
  period: "Окончание викторины должно быть позже начала.",
  save: "Не удалось сохранить викторину. Подробности записаны в журнал сервера.",
};

function errorState(code: string): QuizFormState {
  return {
    error: QUIZ_ERROR_MESSAGES[code] ?? "Проверьте данные викторины.",
    submissionId: Date.now(),
  };
}

async function uploadImage(form: FormData) {
  const file = form.get("imageFile");
  if (!(file instanceof File) || file.size === 0 || form.get("removeImage") === "1") {
    return null;
  }
  return uploadQuizImage({ file });
}

export async function createQuizAction(_state: QuizFormState, form: FormData): Promise<QuizFormState> {
  const admin = await requireAdminUser();
  const uploaded = await uploadImage(form);
  if (uploaded && !uploaded.ok) {
    return errorState(uploaded.error);
  }

  const uploadedKey = uploaded?.ok ? uploaded.objectKey : null;
  let quiz;
  let draft;

  try {
    draft = parseQuizForm(form, uploadedKey);
    quiz = await createQuiz(draft);
  } catch (error) {
    await deleteQuizImageBestEffort(uploadedKey);
    console.error("Не удалось создать викторину.", error);
    return errorState(getQuizSaveError(error));
  }

  await logActivity({
    action: "quiz.created",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz",
    entityId: quiz.id,
    entityLabel: draft.question ?? `Викторина #${quiz.id}`,
    message: "Викторина создана.",
  });
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes?created=1");
}

export async function updateQuizAction(_state: QuizFormState, form: FormData): Promise<QuizFormState> {
  const admin = await requireAdminUser();
  const id = Number(form.get("quizId"));
  const current = Number.isSafeInteger(id) ? await getAdminQuizById(id) : null;
  if (!current) return errorState("missing");

  const removeImage = form.get("removeImage") === "1";
  const uploaded = await uploadImage(form);
  if (uploaded && !uploaded.ok) return errorState(uploaded.error);

  const uploadedKey = uploaded?.ok ? uploaded.objectKey : null;
  const nextImageObjectKey = removeImage ? null : uploadedKey ?? current.imageObjectKey;
  let draft;

  try {
    draft = parseQuizForm(form, nextImageObjectKey);
    await updateQuiz(id, draft);
  } catch (error) {
    await deleteQuizImageBestEffort(uploadedKey);
    console.error("Не удалось изменить викторину.", error);
    return errorState(getQuizSaveError(error));
  }

  if (nextImageObjectKey !== current.imageObjectKey) {
    await deleteQuizImageBestEffort(current.imageObjectKey);
  }
  await logActivity({
    action: "quiz.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz",
    entityId: id,
    entityLabel: draft.question ?? `Викторина #${id}`,
    message: "Викторина изменена.",
  });
  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${id}/edit?updated=1`);
}

export async function deleteQuizAction(form: FormData) {
  const admin = await requireAdminUser();
  const id = Number(form.get("quizId"));
  const quiz = await deleteQuiz(id);
  if (quiz) {
    await deleteQuizImageBestEffort(quiz.imageObjectKey);
    await logActivity({
      action: "quiz.deleted",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "quiz",
      entityId: id,
      entityLabel: quiz.question ?? `Викторина #${id}`,
      message: "Викторина удалена.",
    });
  }
  revalidatePath("/admin/quizzes");
}

export async function toggleQuizAction(form: FormData) {
  const admin = await requireAdminUser();
  const id = Number(form.get("quizId"));
  const enabled = form.get("enabled") === "1";
  const quiz = await setQuizEnabled(id, enabled);
  if (quiz) {
    await logActivity({
      action: "quiz.toggled",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "quiz",
      entityId: id,
      entityLabel: quiz.question ?? `Викторина #${id}`,
      message: enabled ? "Викторина включена." : "Викторина отключена.",
    });
  }
  revalidatePath("/admin/quizzes");
}
