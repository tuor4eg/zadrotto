import { notFound } from "next/navigation";

import { getAdminQuizById } from "@/db/queries/quizzes";
import { getAllMediaTypeOptions } from "@/db/queries/media-types";

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
  const [item, mediaTypes] = await Promise.all([
    getAdminQuizById(id),
    getAllMediaTypeOptions(),
  ]);

  if (!item) notFound();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Редактирование квиза"
        description={item.question ?? "Квиз с изображением"}
      />
      <QuizForm action={updateQuizAction} item={item} mediaTypes={mediaTypes} />
    </div>
  );
}
