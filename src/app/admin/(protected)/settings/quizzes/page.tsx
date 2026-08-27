import { CircleHelp } from "lucide-react";

import { getQuizQuestionTemplates } from "@/db/queries/quiz-question-templates";
import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";

import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { SettingsSectionHeader } from "../settings-section-header";
import { QuizQuestionTemplatesManager } from "./quiz-question-templates-manager";

type PageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    updated?: string;
  }>;
};

function getTemplateErrorMessage(code?: string) {
  if (code === "duplicate-name") return "Шаблон с таким названием уже существует.";
  if (code === "invalid") return "Заполните название и текст вопроса.";
  if (code === "missing") return "Шаблон уже удалён или не существует.";
  return getAdminFormErrorMessage(code);
}

function getSuccessMessage(params: Awaited<PageProps["searchParams"]>) {
  if (params.created === "1") return "Шаблон создан.";
  if (params.updated === "1") return "Шаблон сохранён.";
  if (params.deleted === "1") return "Шаблон удалён.";
  return null;
}

export default async function AdminQuizSettingsPage({ searchParams }: PageProps) {
  const [templates, params] = await Promise.all([getQuizQuestionTemplates(), searchParams]);
  const successMessage = getSuccessMessage(params);
  const errorMessage = getTemplateErrorMessage(params.error);
  const messages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <section>
      <AdminToasts
        clearParams={["created", "deleted", "error", "updated"]}
        messages={messages}
      />
      <SettingsSectionHeader
        description="Заготовки текста для новых викторин. Выбор шаблона копирует вопрос и не связывает его с викториной."
        icon={<CircleHelp />}
        title="Викторины"
      />

      <QuizQuestionTemplatesManager templates={templates} />
    </section>
  );
}
