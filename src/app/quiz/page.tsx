import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getAllMediaTypeOptions } from "@/db/queries/media-types";
import { getActiveQuiz } from "@/db/queries/quizzes";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getMediaTypeLabel } from "@/lib/media/types";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  await requireAuthor();
  const [quiz, mediaTypes] = await Promise.all([
    getActiveQuiz(),
    getAllMediaTypeOptions(),
  ]);

  return (
    <main className="archive-page min-h-screen px-4 py-8 text-stone-950">
      <section className="archive-paper archive-panel mx-auto flex max-w-3xl flex-col gap-5 p-5 sm:p-8">
        <h1 className="font-serif text-3xl">Квиз</h1>
        {quiz ? (
          <>
            <div className="flex flex-wrap gap-2 text-xs text-stone-600">
              Подходящие типы: {quiz.mediaTypes.length === 0
                ? "любые"
                : quiz.mediaTypes
                    .map((type) => getMediaTypeLabel(type, mediaTypes))
                    .join(", ")}
            </div>
            {quiz.question ? <p className="text-lg">{quiz.question}</p> : null}
            {quiz.imageUrl ? (
              <img
                src={quiz.imageUrl}
                alt="Изображение к вопросу"
                className="max-h-[600px] w-full rounded-md object-contain"
              />
            ) : null}
            <p className="text-sm text-stone-600">
              До {new Intl.DateTimeFormat("ru-RU", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(quiz.endsAt))}
            </p>
            <Link className={buttonVariants()} href="/archive">
              Искать ответ в архиве
            </Link>
          </>
        ) : (
          <>
            <p className="text-stone-600">Сейчас активного квиза нет.</p>
            <Link className={buttonVariants({ variant: "outline" })} href="/archive">
              Вернуться в архив
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
