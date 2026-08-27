"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";

import { EmptyState } from "../../admin-ui";
import {
  createQuizQuestionTemplateAction,
  deleteQuizQuestionTemplateAction,
  updateQuizQuestionTemplateAction,
} from "./actions";

type QuestionTemplate = {
  id: number;
  name: string;
  question: string;
  updatedAt: Date;
};

const inputClassName = "w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950";
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

function TemplateActions({
  onEdit,
  template,
}: {
  onEdit: () => void;
  template: QuestionTemplate;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Tooltip label="Изменить">
        <Button aria-label="Изменить" size="icon" type="button" variant="outline" onClick={onEdit}>
          <Pencil />
        </Button>
      </Tooltip>
      <Tooltip label="Удалить">
        <ConfirmAction
          action={deleteQuizQuestionTemplateAction}
          confirmLabel="Удалить шаблон"
          description={`Шаблон «${template.name}» будет удалён. Уже созданные викторины не изменятся.`}
          fields={[{ name: "templateId", value: template.id }]}
          title="Удалить шаблон?"
          triggerAriaLabel={`Удалить шаблон ${template.name}`}
          triggerIcon={<Trash2 />}
          triggerLabel="Удалить"
          triggerSize="icon"
        />
      </Tooltip>
    </div>
  );
}

function TemplateModal({
  onClose,
  template,
}: {
  onClose: () => void;
  template: QuestionTemplate | null;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4">
      <button
        aria-label="Закрыть окно"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative w-full max-w-xl rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold" id={titleId}>
            {template ? "Изменить шаблон" : "Новый шаблон"}
          </h2>
          <Button aria-label="Закрыть" onClick={onClose} size="icon" type="button" variant="ghost">
            <X />
          </Button>
        </div>

        <form
          action={template ? updateQuizQuestionTemplateAction : createQuizQuestionTemplateAction}
          className="mt-5 grid gap-4"
        >
          {template ? <input name="templateId" type="hidden" value={template.id} /> : null}
          <label className="grid gap-2 text-sm font-medium text-stone-800">
            Название
            <input
              autoFocus
              className={`${inputClassName} h-10`}
              defaultValue={template?.name ?? ""}
              name="name"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-stone-800">
            Текст вопроса
            <textarea
              className={`${inputClassName} min-h-36 p-3`}
              defaultValue={template?.question ?? ""}
              name="question"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">Отмена</Button>
            <Button type="submit">{template ? "Сохранить" : "Создать"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QuizQuestionTemplatesManager({ templates }: { templates: QuestionTemplate[] }) {
  const [modalState, setModalState] = useState<QuestionTemplate | "new" | null>(null);
  const closeModal = () => setModalState(null);

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-medium text-stone-950">Шаблоны вопросов</h4>
        <Button onClick={() => setModalState("new")} type="button">
          <Plus />
          Новый шаблон
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState>Шаблонов вопросов пока нет.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {templates.map((template) => (
              <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={template.id}>
                <h5 className="font-medium text-stone-950">{template.name}</h5>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                  {template.question}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
                  <span className="text-xs tabular-nums text-stone-500">
                    {dateTimeFormatter.format(template.updatedAt)}
                  </span>
                  <TemplateActions onEdit={() => setModalState(template)} template={template} />
                </div>
              </article>
            ))}
          </div>

          <TableWrap className="hidden md:block">
            <Table className="table-fixed">
              <THead>
                <tr>
                  <TH className="w-1/4">Название</TH>
                  <TH>Текст вопроса</TH>
                  <TH className="w-40">Изменён</TH>
                  <TH className="w-52 text-right">Действия</TH>
                </tr>
              </THead>
              <TBody>
                {templates.map((template) => (
                  <TR key={template.id}>
                    <TD className="font-medium text-stone-950">{template.name}</TD>
                    <TD>
                      <p className="line-clamp-2 whitespace-pre-wrap text-stone-600">{template.question}</p>
                    </TD>
                    <TD className="text-xs tabular-nums text-stone-500">
                      {dateTimeFormatter.format(template.updatedAt)}
                    </TD>
                    <TD>
                      <TemplateActions onEdit={() => setModalState(template)} template={template} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}

      {modalState ? (
        <TemplateModal
          key={modalState === "new" ? "new" : modalState.id}
          onClose={closeModal}
          template={modalState === "new" ? null : modalState}
        />
      ) : null}
    </div>
  );
}
