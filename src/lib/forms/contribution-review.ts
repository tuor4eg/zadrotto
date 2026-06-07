export const REVIEW_TITLE_MAX_LENGTH = 160;
export const REVIEW_BODY_MIN_LENGTH = 20;
export const REVIEW_BODY_MAX_LENGTH = 12_000;

export type ReviewFormError =
  | "invalid-media-item"
  | "not-found"
  | "required"
  | "title-too-long"
  | "body-too-short"
  | "body-too-long"
  | "locked";

export type ReviewFormInput =
  | {
      ok: true;
      value: {
        title: string;
        body: string;
      };
    }
  | {
      ok: false;
      error: ReviewFormError;
    };

export function parseReviewFormInput(input: {
  title: FormDataEntryValue | null | string;
  body: FormDataEntryValue | null | string;
}): ReviewFormInput {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  if (!title || !body) {
    return { ok: false, error: "required" };
  }

  if (title.length > REVIEW_TITLE_MAX_LENGTH) {
    return { ok: false, error: "title-too-long" };
  }

  if (body.length < REVIEW_BODY_MIN_LENGTH) {
    return { ok: false, error: "body-too-short" };
  }

  if (body.length > REVIEW_BODY_MAX_LENGTH) {
    return { ok: false, error: "body-too-long" };
  }

  return {
    ok: true,
    value: {
      title,
      body,
    },
  };
}

export function getReviewFormErrorMessage(error?: string | null) {
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

  if (error === "locked") {
    return "Эту рецензию сейчас нельзя редактировать.";
  }

  return null;
}
