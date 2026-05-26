"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Input, Label } from "@/components/ui/form";
import {
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_TITLE_MAX_LENGTH,
} from "@/lib/contribution-review-form";
import { saveAuthorReviewAction, type SaveAuthorReviewState } from "./actions";

type AuthorReviewFormProps = {
  contributionId?: number;
  mediaItem: {
    id: number;
    title: string;
  };
  values?: {
    title: string;
    body: string;
  };
};

export function AuthorReviewForm({
  contributionId,
  mediaItem,
  values,
}: AuthorReviewFormProps) {
  const initialState: SaveAuthorReviewState = {
    error: null,
    values: {
      title: values?.title ?? "",
      body: values?.body ?? "",
    },
  };
  const [state, formAction, isPending] = useActionState(saveAuthorReviewAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
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
        <AutoResizeTextarea
          id="body"
          name="body"
          required
          maxLength={REVIEW_BODY_MAX_LENGTH}
          defaultValue={state.values.body}
          className="min-h-64"
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={isPending}>
          Сохранить черновик
        </Button>
        <Button type="submit" name="intent" value="submit" variant="positive" disabled={isPending}>
          Отправить на проверку
        </Button>
      </div>
    </form>
  );
}
