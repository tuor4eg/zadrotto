"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";

import { AchievementImagePicker } from "@/components/achievements/achievement-image-picker";
import { QuizAnswerPicker } from "@/components/quizzes/quiz-answer-picker";
import { runServerActionWithImageUploadGuard } from "@/components/forms/image-upload-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { MediaTypeOption } from "@/lib/media/types";
import { formatMoscowDateTimeLocal } from "@/lib/quizzes/admin-time";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import type { QuizFormState } from "./actions";

type Quiz = {
  id: number;
  question: string | null;
  comment: string | null;
  imageUrl: string | null;
  answerMediaItemId: number;
  answerTitle: string;
  answerMediaType: string;
  mediaTypes: string[];
  startsAt: Date;
  endsAt: Date;
  attemptLimit: number;
  hasAnswers: boolean;
  hasParticipants: boolean;
  enabled: boolean;
};

type QuizFormProps = {
  action: (state: QuizFormState, formData: FormData) => Promise<QuizFormState>;
  defaultEndsAt?: Date;
  defaultStartsAt?: Date;
  item?: Quiz | null;
  mediaTypes: MediaTypeOption[];
  questionTemplates?: Array<{ id: number; name: string; question: string }>;
};

const inputClass = "h-10 rounded-md border border-stone-300 px-3";

export function QuizForm({
  action,
  defaultEndsAt,
  defaultStartsAt,
  item,
  mediaTypes,
  questionTemplates = [],
}: QuizFormProps) {
  const [state, formAction, actionPending] = useActionState(async (current: QuizFormState, formData: FormData) => {
    return runServerActionWithImageUploadGuard(
      () => action(current, formData),
      (message) => ({ error: message, submissionId: Date.now() }),
    )
  }, {
    error: null,
    submissionId: 0,
  });
  const [transitionPending, startTransition] = useTransition();
  const [question, setQuestion] = useState(item?.question ?? "");
  const [pendingQuestionTemplate, setPendingQuestionTemplate] = useState<
    NonNullable<QuizFormProps["questionTemplates"]>[number] | null
  >(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedMediaTypes, setSelectedMediaTypes] = useState(item?.mediaTypes ?? []);
  const allMediaTypesSelected = mediaTypes.length > 0 && selectedMediaTypes.length === mediaTypes.length;
  const isPending = actionPending || transitionPending;
  const toastMessages = state.error
    ? [{ id: `quiz-save-${state.submissionId}`, tone: "error" as const, text: state.error }]
    : [] satisfies AdminToast[];

  return (
    <form
      action={formAction}
      className="grid max-w-3xl gap-5 rounded-md border bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        startTransition(() => formAction(new FormData(form)));
      }}
    >
      <AdminToasts messages={toastMessages} />
      {item ? <input type="hidden" name="quizId" value={item.id} /> : null}

      <div className="grid gap-2">
          <label htmlFor="questionTemplate" className="text-sm font-medium">Шаблон вопроса</label>
          <select
            className={inputClass}
            disabled={questionTemplates.length === 0}
            id="questionTemplate"
            onChange={(event) => {
              const nextTemplateId = event.currentTarget.value;
              const template = questionTemplates.find(({ id }) => String(id) === nextTemplateId);
              if (!template) {
                setSelectedTemplateId("");
                return;
              }

              if (question.trim() && question !== template.question) {
                setPendingQuestionTemplate(template);
                setSelectedTemplateId("");
                return;
              }

              setQuestion(template.question);
              setSelectedTemplateId(nextTemplateId);
            }}
            value={selectedTemplateId}
          >
            <option value="">Без шаблона</option>
            {questionTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          {questionTemplates.length === 0 ? (
            <p className="text-xs text-stone-500">
              Шаблонов пока нет.{" "}
              <Link className="underline underline-offset-2" href="/admin/settings/quizzes">
                Настроить шаблоны
              </Link>
            </p>
          ) : (
            <p className="text-xs text-stone-500">Шаблон только подставляет текст — вопрос можно изменить перед сохранением.</p>
          )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="question" className="text-sm font-medium">Вопрос</label>
        <textarea
          className="min-h-24 rounded-md border border-stone-300 p-3"
          id="question"
          name="question"
          onChange={(event) => {
            setQuestion(event.currentTarget.value);
            setSelectedTemplateId("");
          }}
          value={question}
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="comment" className="text-sm font-medium">Комментарий после правильного ответа</label>
        <textarea
          className="min-h-24 rounded-md border border-stone-300 p-3"
          id="comment"
          name="comment"
          maxLength={2000}
          defaultValue={item?.comment ?? ""}
        />
        <p className="text-xs text-stone-500">Необязательно. Будет показан после правильного ответа.</p>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Изображение</span>
        <AchievementImagePicker
          inputId="quiz-image"
          initialImageUrl={item?.imageUrl ?? null}
          variant="quiz"
        />
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Правильная запись</span>
        {item?.hasAnswers ? (
          <>
            <input type="hidden" name="answerMediaItemId" value={item.answerMediaItemId} />
            <p className="rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-700">
              {item.answerTitle} · {mediaTypes.find((type) => type.code === item.answerMediaType)?.name ?? item.answerMediaType}
            </p>
          </>
        ) : (
          <QuizAnswerPicker
            allowedMediaTypes={selectedMediaTypes}
            mediaTypes={mediaTypes}
            initial={item ? {
              id: item.answerMediaItemId,
              title: item.answerTitle,
              originalTitle: null,
              releaseYear: null,
              mediaType: item.answerMediaType,
            } : null}
          />
        )}
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Допустимые типы</legend>
        <p className="text-xs text-stone-500">
          Выберите хотя бы один тип записей, среди которых можно искать ответ.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input
              type="checkbox"
              checked={allMediaTypesSelected}
              disabled={item?.hasAnswers ?? false}
              onChange={(event) => {
                setSelectedMediaTypes(event.currentTarget.checked ? mediaTypes.map((type) => type.code) : []);
              }}
            />
            Все
          </label>
          {mediaTypes.map((type) => (
            <label key={type.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="mediaTypes"
                value={type.code}
                checked={selectedMediaTypes.includes(type.code)}
                disabled={item?.hasAnswers ?? false}
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  setSelectedMediaTypes((current) =>
                    checked
                      ? [...current, type.code]
                      : current.filter((code) => code !== type.code),
                  )
                }}
              />
              {type.name}
            </label>
          ))}
        </div>
        {item?.hasAnswers ? (
          <>
            {selectedMediaTypes.map((mediaType) => <input key={mediaType} type="hidden" name="mediaTypes" value={mediaType} />)}
            <p className="text-xs text-stone-500">Правильная запись и допустимые типы заблокированы после первого ответа участника.</p>
          </>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimePicker
          defaultValue={formatMoscowDateTimeLocal(item?.startsAt ?? defaultStartsAt)}
          label="Начало"
          name="startsAt"
          timeZoneLabel="МСК"
        />
        <DateTimePicker
          defaultValue={formatMoscowDateTimeLocal(item?.endsAt ?? defaultEndsAt)}
          label="Окончание"
          name="endsAt"
          timeZoneLabel="МСК"
        />
      </div>

      <div className="grid max-w-xs gap-2">
        <label htmlFor="attemptLimit" className="text-sm font-medium">Количество попыток</label>
        <input
          className={inputClass}
          id="attemptLimit"
          name="attemptLimit"
          type="number"
          min={1}
          max={10}
          step={1}
          defaultValue={item?.attemptLimit ?? 3}
          disabled={item?.hasParticipants ?? false}
          required
        />
        {item?.hasParticipants ? (
          <><input type="hidden" name="attemptLimit" value={item.attemptLimit} /><p className="text-xs text-stone-500">Лимит нельзя изменить после присоединения участника.</p></>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          value="1"
          defaultChecked={item?.enabled ?? true}
        />
        Включён
      </label>

      <p className="text-xs text-stone-500">
        Нужно заполнить вопрос или добавить изображение.
      </p>
      {pendingQuestionTemplate ? (
        <ConfirmDialog
          description="Текущий текст вопроса будет заменён текстом выбранного шаблона."
          onClose={() => setPendingQuestionTemplate(null)}
          title="Заменить вопрос?"
        >
          <Button
            onClick={() => {
              setQuestion(pendingQuestionTemplate.question);
              setSelectedTemplateId(String(pendingQuestionTemplate.id));
              setPendingQuestionTemplate(null);
            }}
            type="button"
          >
            Заменить
          </Button>
        </ConfirmDialog>
      ) : null}
      <Button type="submit" disabled={isPending || selectedMediaTypes.length === 0}>
        {isPending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
