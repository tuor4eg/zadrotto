import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getAdminQuizById } from "@/db/queries/quizzes";
import { getAllMediaTypeOptions } from "@/db/queries/media-types";
import { getQuizQuestionTemplates } from "@/db/queries/quiz-question-templates";

import { PageHeader } from "../../../admin-ui";
import { updateQuizAction } from "../../actions";
import { QuizForm } from "../../quiz-form";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idValue } = await params;
  const id = Number(idValue);
  const [item, mediaTypes, questionTemplates] = await Promise.all([
    getAdminQuizById(id),
    getAllMediaTypeOptions(),
    getQuizQuestionTemplates(),
  ]);

  if (!item) notFound();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Редактирование викторины"
        description={item.question ?? "Викторина с изображением"}
        aside={(
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/quizzes">
            <ArrowLeft />
            Назад
          </Link>
        )}
      />
      <QuizForm
        action={updateQuizAction}
        item={item}
        mediaTypes={mediaTypes}
        questionTemplates={questionTemplates}
      />
    </div>
  );
}
