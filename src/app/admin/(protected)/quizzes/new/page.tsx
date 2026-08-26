import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getAllMediaTypeOptions } from "@/db/queries/media-types";
import { getDefaultQuizPeriod } from "@/lib/quizzes/admin-time";

import { PageHeader } from "../../admin-ui";
import { createQuizAction } from "../actions";
import { QuizForm } from "../quiz-form";

export default async function NewQuizPage() {
  const mediaTypes = await getAllMediaTypeOptions();
  const defaultPeriod = getDefaultQuizPeriod();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Новая викторина"
        description="Создайте вопрос и укажите правильную запись."
        aside={(
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/quizzes">
            <ArrowLeft />
            Назад
          </Link>
        )}
      />
      <QuizForm
        action={createQuizAction}
        defaultEndsAt={defaultPeriod.endsAt}
        defaultStartsAt={defaultPeriod.startsAt}
        mediaTypes={mediaTypes}
      />
    </div>
  );
}
