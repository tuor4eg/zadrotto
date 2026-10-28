import { Archive, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { QuizEmptyState } from "@/components/quizzes/quiz-empty-state";
import { QuizFittingRows } from "@/components/quizzes/quiz-fitting-rows";
import type { getQuizArchive } from "@/db/queries/quizzes";

type QuizArchiveItem = Awaited<ReturnType<typeof getQuizArchive>>[number];

export function QuizArchiveList({ items, showAllLink = true, breadcrumbs, fitRows = false }: { items: QuizArchiveItem[]; showAllLink?: boolean; breadcrumbs?: ReactNode; fitRows?: boolean }) {
  return (
    <section
      className={`archive-paper archive-panel h-full min-h-80 p-4 sm:p-5 ${fitRows ? "flex flex-col lg:min-h-0" : ""}`}
      aria-labelledby="quiz-archive-title"
    >
      {breadcrumbs ? <div className="mb-5">{breadcrumbs}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2
          id="quiz-archive-title"
          className="flex items-center gap-2 media-carrier-font-pc-steam text-xl leading-none sm:text-2xl"
        >
          <Archive className="size-5 shrink-0 text-red-950/70" aria-hidden="true" />
          Архив квизов
        </h2>
        {showAllLink ? (
          <Link href="/quizzes/archive" className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">
            Смотреть всё →
          </Link>
        ) : null}
      </div>

      {items.length > 0 ? (
        <QuizFittingRows enabled={fitRows}>
          <ul className="mt-3 divide-y divide-dashed divide-stone-400/35">
            {items.map((item) => (
              <li key={item.id} data-quiz-row className="py-2 first:pt-0">
                <Link
                  href={`/quizzes/${item.id}`}
                  className="flex min-w-0 gap-3 rounded-md transition-colors hover:bg-stone-400/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-700"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-md border border-stone-400/30 object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-20 shrink-0 place-items-center rounded-md border border-stone-400/30 bg-stone-300/35">
                      <Archive className="size-5 text-stone-500" aria-hidden="true" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-serif text-sm leading-snug text-stone-950 sm:text-base">
                      {item.question?.trim() || "Квиз без текстового вопроса"}
                    </p>
                    {item.mediaTypes.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.mediaTypes.map((mediaType) => (
                          <span
                            key={mediaType.code}
                            className="rounded-sm bg-stone-300/60 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-stone-600"
                          >
                            {mediaType.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <dl className="w-28 shrink-0 space-y-1 text-[10px] leading-tight text-stone-600">
                    <div className="flex items-center gap-1.5">
                      <Users className="size-3.5 shrink-0" aria-hidden="true" />
                      <dt className="sr-only">Участников</dt>
                      <dd>Участников: {item.participantCount.toLocaleString("ru-RU")}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Trophy className="size-3.5 shrink-0" aria-hidden="true" />
                      <dt className="sr-only">Ответили правильно</dt>
                      <dd className="truncate">{item.correctCount}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </QuizFittingRows>
      ) : (
        <QuizEmptyState
          imageSrc="/quiz_archieve_placeholder.webp"
          title="Здесь пока нет завершенных квизов"
          description="Самое время стать частью истории"
        />
      )}
    </section>
  );
}
