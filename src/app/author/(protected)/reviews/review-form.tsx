"use client";

import { useActionState, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import {
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_TITLE_MAX_LENGTH,
} from "@/lib/forms/contribution-review";
import type { ContributionStatus } from "@/lib/contributions/model";
import { saveAuthorReviewAction, type SaveAuthorReviewState } from "./actions";

type AuthorReviewFormProps = {
  canPublishWithoutReview?: boolean;
  contributionId?: number;
  mediaItem: {
    id: number;
    title: string;
  };
  status?: ContributionStatus;
  values?: {
    title: string;
    body: string;
  };
};

export function AuthorReviewForm({
  canPublishWithoutReview = false,
  contributionId,
  mediaItem,
  status,
  values,
}: AuthorReviewFormProps) {
  const isExistingReview = Boolean(contributionId);
  const canSaveDraft = !isExistingReview || status === "draft";
  const isPublishedReview = status === "published";
  const submitLabel = canPublishWithoutReview
    ? isExistingReview
      ? "Опубликовать изменения"
      : "Опубликовать"
    : isExistingReview
      ? "Отправить на повторную проверку"
      : "Отправить на проверку";
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isConfirmedSubmitRef = useRef(false);
  const initialState: SaveAuthorReviewState = {
    error: null,
    values: {
      title: values?.title ?? "",
      body: values?.body ?? "",
    },
  };
  const [state, formAction, isPending] = useActionState(saveAuthorReviewAction, initialState);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement ? submitter.value : "";

    if (
      canPublishWithoutReview ||
      !isPublishedReview ||
      intent !== "submit" ||
      isConfirmedSubmitRef.current
    ) {
      isConfirmedSubmitRef.current = false;

      return;
    }

    event.preventDefault();
    setIsConfirmOpen(true);
  }

  function confirmPublishedReviewSubmit() {
    isConfirmedSubmitRef.current = true;
    setIsConfirmOpen(false);
    const submitButton = formRef.current?.querySelector<HTMLButtonElement>(
      'button[name="intent"][value="submit"]',
    );

    formRef.current?.requestSubmit(submitButton);
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-4" onSubmit={handleSubmit}>
      {contributionId ? (
        <input type="hidden" name="contributionId" value={contributionId} />
      ) : null}
      <input type="hidden" name="mediaItemId" value={mediaItem.id} />

      <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Запись архива: <span className="font-medium text-stone-950">{mediaItem.title}</span>
      </div>

      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}

      <div className="grid gap-2">
        <Label htmlFor="title">Заголовок</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={REVIEW_TITLE_MAX_LENGTH}
          defaultValue={state.values.title}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="body">Текст</Label>
        <Textarea
          id="body"
          name="body"
          required
          maxLength={REVIEW_BODY_MAX_LENGTH}
          defaultValue={state.values.body}
          className="h-[calc(100dvh-30rem)] min-h-64 resize-none overflow-y-auto"
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {canSaveDraft ? (
          <Button type="submit" name="intent" value="draft" variant="outline" disabled={isPending}>
            Сохранить черновик
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="submit"
          variant="positive"
          disabled={isPending}
        >
          {submitLabel}
        </Button>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрыть предупреждение"
            onClick={() => setIsConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-submit-warning-title"
            className="relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
          >
            <div>
              <h2 id="review-submit-warning-title" className="text-lg font-semibold tracking-tight">
                Отправить изменения?
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Текущая опубликованная рецензия пропадет со страницы записи, пока администратор
                не одобрит новую версию.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsConfirmOpen(false)}>
                Отмена
              </Button>
              <Button type="button" variant="positive" onClick={confirmPublishedReviewSubmit}>
                Отправить
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
