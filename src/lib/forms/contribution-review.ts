import { REVIEW_BODY_MAX_BYTES, reviewBodyToPlainText, type ReviewBodyFormat } from "@/lib/reviews/body";

import { REVIEW_TITLE_MAX_LENGTH, REVIEW_BODY_MIN_LENGTH, REVIEW_BODY_MAX_LENGTH } from "@/lib/reviews/constants";
export { REVIEW_TITLE_MAX_LENGTH, REVIEW_BODY_MIN_LENGTH, REVIEW_BODY_MAX_LENGTH } from "@/lib/reviews/constants";

export type ReviewFormError =
  | "invalid-body-format"
  | "invalid-body"
  | "invalid-media-item"
  | "not-found"
  | "required"
  | "title-too-long"
  | "body-too-short"
  | "body-too-long"
  | "locked"
  | "scope-conflict";

export type ReviewFormInput =
  | {
      ok: true;
      value: {
        title: string;
        body: string;
        bodyFormat: ReviewBodyFormat;
      };
    }
  | {
      ok: false;
      error: ReviewFormError;
    };

export function parseReviewFormInput(input: {
  title: FormDataEntryValue | null | string;
  body: FormDataEntryValue | null | string;
  bodyFormat?: FormDataEntryValue | null | string;
}): ReviewFormInput {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  const bodyFormat = input.bodyFormat ?? "plain";
  if (bodyFormat !== "plain" && bodyFormat !== "markdown") return { ok: false, error: "invalid-body-format" };
  if (new TextEncoder().encode(typeof input.body === "string" ? input.body : "").length > REVIEW_BODY_MAX_BYTES) return { ok: false, error: "body-too-long" };
  let visibleBody: string;
  try {
    visibleBody = reviewBodyToPlainText(body, bodyFormat);
  } catch {
    return { ok: false, error: "invalid-body" };
  }

  if (!title || !body) {
    return { ok: false, error: "required" };
  }

  if (title.length > REVIEW_TITLE_MAX_LENGTH) {
    return { ok: false, error: "title-too-long" };
  }

  if (visibleBody.length < REVIEW_BODY_MIN_LENGTH) {
    return { ok: false, error: "body-too-short" };
  }

  if (visibleBody.length > REVIEW_BODY_MAX_LENGTH) {
    return { ok: false, error: "body-too-long" };
  }

  return {
    ok: true,
    value: {
      title,
      body,
      bodyFormat,
    },
  };
}

export function getReviewFormErrorMessage(error?: string | null) {
  if (error === "invalid-body") return "Не удалось прочитать текст рецензии. Проверьте форматирование.";
  if (error === "invalid-body-format") return "Неизвестный формат текста рецензии.";

  if (error === "invalid-media-item") {
    return "Не удалось определить запись архива.";
  }

  if (error === "not-found") {
    return "Рецензия или запись архива не найдена.";
  }

  if (error === "required") {
    return "Заполни заголовок и текст рецензии.";
  }

  if (error === "title-too-long") {
    return "Заголовок должен быть не длиннее 160 символов.";
  }

  if (error === "body-too-short") {
    return "Текст рецензии должен быть не короче 20 символов.";
  }

  if (error === "body-too-long") {
    return "Текст рецензии должен быть не длиннее 12000 символов.";
  }

  if (error === "scope-conflict") {
    return "У вас уже есть рецензия на выбранную часть или всю запись. Выберите другую привязку.";
  }

  if (error === "locked") {
    return "Эту рецензию сейчас нельзя редактировать.";
  }

  return null;
}

export function parseReviewPartId(value: FormDataEntryValue | null | string) {
  if (value === null || value === "") return { ok: true as const, partId: null };
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return { ok: false as const };
  const partId = Number(value);
  return Number.isSafeInteger(partId) ? { ok: true as const, partId } : { ok: false as const };
}
