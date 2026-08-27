import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PaginationNav } from "@/components/pagination-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  getAdminQuizAggregates,
  getAdminQuizContext,
  getAdminQuizParticipantPage,
  getAdminQuizWinner,
} from "@/db/queries/quizzes";
import { parsePage } from "@/lib/common/pagination";
import {
  formatQuizDuration,
  type AdminQuizParticipantStatus,
} from "@/lib/quizzes/admin-analytics";
import type { QuizState } from "@/lib/quizzes/model";

import { EmptyState, PageHeader } from "../../admin-ui";

const QUIZ_STATE_LABELS: Record<QuizState, string> = {
  active: "Активна",
  disabled: "Выключена",
  finished: "Завершена",
  scheduled: "Запланирована",
};

const QUIZ_STATE_VARIANTS: Record<QuizState, "default" | "outline" | "positive" | "warning"> = {
  active: "positive",
  disabled: "outline",
  finished: "default",
  scheduled: "warning",
};

const PARTICIPANT_STATUS_LABELS: Record<AdminQuizParticipantStatus, string> = {
  answering: "Отвечает",
  correct: "Ответил правильно",
  exhausted: "Попытки исчерпаны",
  "not-started": "Ещё не отвечал",
  winner: "Победитель",
};

const PARTICIPANT_STATUS_VARIANTS: Record<
  AdminQuizParticipantStatus,
  "outline" | "positive" | "warning" | "destructive"
> = {
  answering: "warning",
  correct: "positive",
  exhausted: "destructive",
  "not-started": "outline",
  winner: "positive",
};

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Europe/Moscow",
});

function formatDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "—";
}

function StatisticCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-stone-950">{value}</div>
    </div>
  );
}

export default async function AdminQuizResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ id: idValue }, query] = await Promise.all([params, searchParams]);
  const quizId = Number(idValue);
  if (!Number.isSafeInteger(quizId) || quizId < 1) notFound();

  const [quiz, aggregates, winner] = await Promise.all([
    getAdminQuizContext(quizId),
    getAdminQuizAggregates(quizId),
    getAdminQuizWinner(quizId),
  ]);
  if (!quiz) notFound();

  const participantsPage = await getAdminQuizParticipantPage({
    quizId,
    requestedPage: parsePage(query.page),
    totalCount: aggregates.totalCount,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Результаты викторины"
        description={quiz.question ?? "Викторина с изображением"}
        aside={(
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/quizzes">
            <ArrowLeft />
            Назад
          </Link>
        )}
      />

      <section className="grid gap-4 rounded-lg border border-stone-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={QUIZ_STATE_VARIANTS[quiz.state]}>{QUIZ_STATE_LABELS[quiz.state]}</Badge>
            <span className="text-xs tabular-nums text-stone-500">Викторина #{quiz.id}</span>
          </div>
          <h3 className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">Вопрос</h3>
          <p className="mt-2 whitespace-pre-wrap text-lg font-medium leading-7 text-stone-950">
            {quiz.question ?? "Только изображение"}
          </p>
          {quiz.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Изображение вопроса"
              className="mt-4 max-h-72 max-w-full rounded-md border border-stone-200 object-contain"
              src={quiz.imageUrl}
            />
          ) : null}
        </div>
        <dl className="grid content-start gap-4 border-t border-stone-100 pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">Правильный ответ</dt>
            <dd className="mt-1">
              <Link className="font-medium underline underline-offset-2" href={`/media/${quiz.answerCode}`}>
                {quiz.answerTitle}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">Период</dt>
            <dd className="mt-1 tabular-nums text-stone-700">
              {formatDateTime(quiz.startsAt)} — {formatDateTime(quiz.endsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">Лимит попыток</dt>
            <dd className="mt-1 tabular-nums text-stone-700">{quiz.attemptLimit}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="quiz-statistics-heading">
        <h3 id="quiz-statistics-heading" className="sr-only">Итоги викторины</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatisticCard label="Участники" value={aggregates.totalCount} />
          <StatisticCard label="Ответили правильно" value={aggregates.correctCount} />
          <StatisticCard label="Исчерпали попытки" value={aggregates.exhaustedCount} />
          <StatisticCard label="Продолжают отвечать" value={aggregates.inProgressCount} />
          <StatisticCard
            label="Среднее время правильного ответа"
            value={formatQuizDuration(aggregates.averageCorrectAnswerSeconds)}
          />
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">Победитель</h3>
        {winner ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <Link
              className="flex min-w-0 items-center gap-3 font-medium text-stone-950 underline-offset-2 hover:underline"
              href={`/admin/authors/${winner.authorId}`}
            >
              <Avatar name={winner.authorName} objectKey={winner.authorAvatarObjectKey} />
              <span className="break-words">{winner.authorName}</span>
            </Link>
            <div className="text-sm tabular-nums text-stone-600">
              {formatDateTime(winner.completedAt)} · за {formatQuizDuration(winner.secondsSinceJoined)}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Не определён</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="quiz-participants-heading">
        <h3 id="quiz-participants-heading" className="text-lg font-semibold text-stone-950">Участники</h3>
        {participantsPage.items.length === 0 ? (
          <EmptyState>В викторине пока никто не участвовал.</EmptyState>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {participantsPage.items.map((participant) => (
                <article
                  className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
                  key={participant.authorId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      className="flex min-w-0 items-center gap-2 font-medium text-stone-950 underline-offset-2 hover:underline"
                      href={`/admin/authors/${participant.authorId}`}
                    >
                      <Avatar
                        className="size-9 shrink-0 text-xs"
                        name={participant.authorName}
                        objectKey={participant.authorAvatarObjectKey}
                      />
                      <span className="truncate">{participant.authorName}</span>
                    </Link>
                    <Badge
                      className="shrink-0"
                      variant={PARTICIPANT_STATUS_VARIANTS[participant.status]}
                    >
                      {PARTICIPANT_STATUS_LABELS[participant.status]}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-stone-500">Попытки</dt>
                      <dd className="mt-0.5 tabular-nums text-stone-800">
                        {participant.usedAttempts} из {participant.attemptLimit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">После входа</dt>
                      <dd className="mt-0.5 tabular-nums text-stone-800">
                        {formatQuizDuration(participant.secondsSinceJoined)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">Вошёл</dt>
                      <dd className="mt-0.5 tabular-nums text-stone-800">
                        {formatDateTime(participant.joinedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">Завершил</dt>
                      <dd className="mt-0.5 tabular-nums text-stone-800">
                        {formatDateTime(participant.completedAt)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-stone-500">Время от старта</dt>
                      <dd className="mt-0.5 tabular-nums text-stone-800">
                        {formatQuizDuration(participant.secondsSinceQuizStart)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <TableWrap className="hidden md:block">
              <Table className="table-fixed [&_td]:px-2 [&_th]:px-2 lg:[&_td]:px-3 lg:[&_th]:px-3">
                <THead>
                  <tr>
                    <TH className="w-[15%]">Автор</TH>
                    <TH className="w-[15%]">Статус</TH>
                    <TH className="w-[8%]">Попытки</TH>
                    <TH className="w-[17%]">Вошёл</TH>
                    <TH className="w-[17%]">Завершил</TH>
                    <TH className="w-[16%]">От старта</TH>
                    <TH className="w-[12%]">После входа</TH>
                  </tr>
                </THead>
                <TBody>
                  {participantsPage.items.map((participant) => (
                    <TR key={participant.authorId}>
                      <TD>
                        <Link
                          className="flex min-w-0 items-center gap-2 font-medium text-stone-950 underline-offset-2 hover:underline"
                          href={`/admin/authors/${participant.authorId}`}
                        >
                          <Avatar
                            className="size-8 shrink-0 text-xs"
                            name={participant.authorName}
                            objectKey={participant.authorAvatarObjectKey}
                          />
                          <span className="truncate">{participant.authorName}</span>
                        </Link>
                      </TD>
                      <TD>
                        <Badge variant={PARTICIPANT_STATUS_VARIANTS[participant.status]}>
                          {PARTICIPANT_STATUS_LABELS[participant.status]}
                        </Badge>
                      </TD>
                      <TD className="tabular-nums">
                        {participant.usedAttempts} из {participant.attemptLimit}
                      </TD>
                      <TD className="text-xs tabular-nums text-stone-600">
                        {formatDateTime(participant.joinedAt)}
                      </TD>
                      <TD className="text-xs tabular-nums text-stone-600">
                        {formatDateTime(participant.completedAt)}
                      </TD>
                      <TD className="text-xs tabular-nums text-stone-600">
                        {formatQuizDuration(participant.secondsSinceQuizStart)}
                      </TD>
                      <TD className="text-xs tabular-nums text-stone-600">
                        {formatQuizDuration(participant.secondsSinceJoined)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </>
        )}

        <PaginationNav
          basePath={`/admin/quizzes/${quiz.id}`}
          itemLabel="участников"
          page={participantsPage.page}
          pageSize={participantsPage.pageSize}
          searchParams={{}}
          showPageJump
          totalCount={participantsPage.totalCount}
          totalPages={participantsPage.totalPages}
          variant="admin"
        />
      </section>
    </div>
  );
}
