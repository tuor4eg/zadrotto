"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createQuiz,
  deleteQuiz,
  getAdminQuizById,
  setQuizEnabled,
  resetQuizParticipant,
  updateQuiz,
  type QuizWriteInput,
} from "@/db/queries/quizzes";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { snapshotQuizPoster } from "@/lib/quizzes/poster";
import { isMosaicSeed } from "@/lib/quizzes/mosaic";
import { parseMoscowDateTimeLocal } from "@/lib/quizzes/admin-time";
import {
  deleteQuizImageBestEffort,
  uploadQuizImage,
} from "@/lib/quizzes/images";

function parseQuizForm(form: FormData, imageObjectKey: string | null, validateContent = true): QuizWriteInput {
  const type = String(form.get("type") ?? "classic");
  if (type !== "classic" && type !== "mosaic") throw new Error("invalid-quiz");
  const seed = Number(form.get("seed"));
  if (type === "mosaic" && (form.get("seed") === null || !isMosaicSeed(seed))) throw new Error("invalid-quiz");
  const question = String(form.get("question") ?? "").trim() || null;
  const comment = String(form.get("comment") ?? "").trim() || null;
  const answerMediaItemId = Number(form.get("answerMediaItemId"));
  const startsAt = parseMoscowDateTimeLocal(form.get("startsAt"));
  const endsAt = parseMoscowDateTimeLocal(form.get("endsAt"));
  const mediaTypes = [...new Set(form.getAll("mediaTypes").map(String).filter(Boolean))];
  const attemptLimit = Number(form.get("attemptLimit") ?? (type === "mosaic" ? 10 : 3));

  if (validateContent && type === "classic" && !question && !imageObjectKey) throw new Error("content");
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
  if (mediaTypes.length === 0) throw new Error("media-types");

  return {
    type,
    config: type === "mosaic" ? { seed } : null,
    configVersion: 1,
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
    if (["poster-missing", "poster-source", "content", "answer", "answer-configuration-locked", "dates", "period", "attempt-limit", "attempt-limit-locked", "media-types"].includes(error.message)) {
      return error.message;
    }
    if (error.message === "invalid-answer") return "answer-type";
    if (error.message === "invalid-quiz") return "invalid";
  }

  return "save";
}

export type QuizFormState = { error: string | null; submissionId: number };

const QUIZ_ERROR_MESSAGES: Record<string, string> = {
  "poster-missing": "У выбранной записи нет обложки. Выберите другую запись.",
  "poster-source": "Не удалось получить обложку. Проверьте источник или загрузите обложку в запись и повторите сохранение.",
  answer: "Выберите правильную запись из результатов поиска.",
  "answer-configuration-locked": "Игровая конфигурация заблокирована: мозаика уже публиковалась или участники начали отвечать.",
  "attempt-limit": "Количество попыток или очков должно быть целым числом от 1 до 10.",
  "attempt-limit-locked": "Количество попыток нельзя изменить после присоединения первого участника.",
  "comment-length": "Комментарий должен быть не длиннее 2000 символов.",
  "media-types": "Выберите хотя бы один тип записей.",
  "answer-type": "Тип правильной записи должен входить в допустимые типы квиза.",
  content: "Добавьте текст вопроса или изображение.",
  dates: "Укажите корректные дату и время начала и окончания.",
  "image-invalid": "Не удалось обработать изображение. Используйте JPG, PNG или WebP.",
  "image-too-large": "Изображение должно быть не больше 5 МБ.",
  period: "Окончание квиза должно быть позже начала.",
  save: "Не удалось сохранить квиз. Подробности записаны в журнал сервера.",
};

function errorState(code: string): QuizFormState {
  return {
    error: QUIZ_ERROR_MESSAGES[code] ?? "Проверьте данные квиза.",
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
  let uploadedKey: string | null = null;
  let quiz;
  let draft;
  try {
    draft = parseQuizForm(form, null, false);
    if (draft.type === "mosaic") {
      uploadedKey = await snapshotQuizPoster(draft.answerMediaItemId);
    } else {
      const uploaded = await uploadImage(form);
      if (uploaded && !uploaded.ok) return errorState(uploaded.error);
      uploadedKey = uploaded?.ok ? uploaded.objectKey : null;
    }
    draft = parseQuizForm(form, uploadedKey);
    quiz = await createQuiz(draft);
  } catch (error) {
    await deleteQuizImageBestEffort(uploadedKey);
    console.error("Не удалось создать квиз.", error);
    return errorState(getQuizSaveError(error));
  }

  await logActivity({
    action: "quiz.created",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz",
    entityId: quiz.id,
    entityLabel: draft.question ?? `Квиз #${quiz.id}`,
    message: "Квиз создан.",
  });
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes?created=1");
}

export async function updateQuizAction(_state: QuizFormState, form: FormData): Promise<QuizFormState> {
  const admin = await requireAdminUser();
  const id = Number(form.get("quizId"));
  const current = Number.isSafeInteger(id) ? await getAdminQuizById(id) : null;
  if (!current) return errorState("missing");

  let uploadedKey: string | null = null;
  let nextImageObjectKey = current.imageObjectKey;
  let draft;
  try {
    draft = parseQuizForm(form, current.imageObjectKey, false);
    if (draft.type === "mosaic") {
      if (current.type !== "mosaic" || current.answerMediaItemId !== draft.answerMediaItemId || !current.imageObjectKey) {
        uploadedKey = await snapshotQuizPoster(draft.answerMediaItemId);
        nextImageObjectKey = uploadedKey;
      }
    } else {
      const uploaded = await uploadImage(form);
      if (uploaded && !uploaded.ok) return errorState(uploaded.error);
      uploadedKey = uploaded?.ok ? uploaded.objectKey : null;
      nextImageObjectKey = form.get("removeImage") === "1" ? null : uploadedKey ?? (current.type === "classic" ? current.imageObjectKey : null);
    }
    draft = parseQuizForm(form, nextImageObjectKey);
    const updated = await updateQuiz(id, draft);
    if (!updated) throw new Error("missing");
  } catch (error) {
    await deleteQuizImageBestEffort(uploadedKey);
    console.error("Не удалось изменить квиз.", error);
    return errorState(getQuizSaveError(error));
  }
  if (nextImageObjectKey !== current.imageObjectKey) await deleteQuizImageBestEffort(current.imageObjectKey);

  await logActivity({
    action: "quiz.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "quiz",
    entityId: id,
    entityLabel: draft.question ?? `Квиз #${id}`,
    message: "Квиз изменён.",
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
      entityLabel: quiz.question ?? `Квиз #${id}`,
      message: "Квиз удалён.",
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
      entityLabel: quiz.question ?? `Квиз #${id}`,
      message: enabled ? "Квиз включён." : "Квиз отключён.",
    });
  }
  revalidatePath("/admin/quizzes");
}

export async function resetQuizParticipantAction(form: FormData) {
  const admin = await requireAdminUser();
  const quizId = Number(form.get("quizId"));
  const authorId = Number(form.get("authorId"));
  if (![quizId, authorId].every((id) => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647)) {
    throw new Error("Некорректный квиз или участник.");
  }
  if (await resetQuizParticipant(quizId, authorId)) {
    await logActivity({
      action: "quiz.participant-reset",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "quiz",
      entityId: quizId,
      entityLabel: `Квиз #${quizId}`,
      message: `Прогресс автора #${authorId} сброшен для тестирования.`,
    });
  }
  revalidatePath("/", "layout");
}
