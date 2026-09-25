import { ChartNoAxesColumn, Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  getAdminQuizzes,
  type AdminQuizStateFilter,
  type AdminQuizWinnerFilter,
} from "@/db/queries/quizzes";
import { parsePage } from "@/lib/common/pagination";
import { formatAdminQuizDateTime } from "@/lib/quizzes/admin-time";

import { EmptyState, PageHeader } from "../admin-ui";
import { deleteQuizAction, toggleQuizAction } from "./actions";

const labels = {
  active: "Активен",
  disabled: "Отключён",
  finished: "Завершён",
  scheduled: "Запланирован",
} as const;

const stateValues = ["scheduled", "active", "finished", "disabled"] as const;

function QuizActions({ item }: { item: { id: number } }) {
  return (
    <div className="flex justify-end gap-2">
      <Link aria-label="Результаты" className={buttonVariants({ size: "icon", variant: "outline" })} href={`/admin/quizzes/${item.id}`} title="Результаты">
        <ChartNoAxesColumn />
      </Link>
      <Link aria-label="Изменить" className={buttonVariants({ size: "icon", variant: "outline" })} href={`/admin/quizzes/${item.id}/edit`}>
        <Edit3 />
      </Link>
      <ConfirmAction
        action={deleteQuizAction}
        confirmLabel="Удалить квиз и результаты"
        description="Квиз, его изображение, список участников и все их результаты будут удалены без возможности восстановления. Это изменит личную статистику, общее время, серии, таблицу победителей и архив квизов. Запись с правильным ответом и уже выданные ачивки останутся."
        fields={[{ name: "quizId", value: item.id }]}
        title="Удалить квиз вместе со всей историей?"
        triggerAriaLabel="Удалить"
        triggerIcon={<Trash2 />}
        triggerLabel="Удалить"
        triggerSize="icon"
      />
    </div>
  );
}

function StateToggle({ item }: { item: Awaited<ReturnType<typeof getAdminQuizzes>>["items"][number] }) {
  return (
    <form action={toggleQuizAction}>
      <input type="hidden" name="quizId" value={item.id} />
      <input type="hidden" name="enabled" value={item.enabled ? "0" : "1"} />
      <button type="submit">
        <Badge variant={item.state === "active" ? "default" : "outline"}>{labels[item.state]}</Badge>
      </button>
    </form>
  );
}

function Answer({ item }: { item: Awaited<ReturnType<typeof getAdminQuizzes>>["items"][number] }) {
  return (
    <div className={item.hasEarlierAnswer ? "rounded-md bg-amber-50 px-2 py-1 text-amber-950" : undefined}>
      <span>{item.answerTitle}</span>
      {item.hasEarlierAnswer ? <Badge className="ml-2" variant="warning">Ответ уже встречался</Badge> : null}
    </div>
  );
}

export default async function QuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; state?: string; winner?: string }>;
}) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() ?? "";
  const state = stateValues.includes(params.state as AdminQuizStateFilter)
    ? params.state as AdminQuizStateFilter
    : undefined;
  const winner = params.winner === "yes" || params.winner === "no"
    ? params.winner as AdminQuizWinnerFilter
    : undefined;
  const result = await getAdminQuizzes({ page: parsePage(params.page), searchQuery, state, winner });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Викторины"
        description="Вопросы для поиска ответа в архиве. Сначала показаны самые ранние."
        aside={<Link className={buttonVariants()} href="/admin/quizzes/new"><Plus />Создать</Link>}
      />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid min-w-64 flex-1 gap-1 text-sm">
          <span className="font-medium">Вопрос или ответ</span>
          <input className="h-10 rounded-md border border-stone-300 bg-white px-3" defaultValue={searchQuery} name="q" placeholder="Начните вводить текст" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Состояние</span>
          <select className="h-10 rounded-md border border-stone-300 bg-white px-3" defaultValue={state ?? ""} name="state">
            <option value="">Все</option>
            {stateValues.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Победитель</span>
          <select className="h-10 rounded-md border border-stone-300 bg-white px-3" defaultValue={winner ?? ""} name="winner">
            <option value="">Неважно</option><option value="yes">Есть</option><option value="no">Нет</option>
          </select>
        </label>
        <button className={buttonVariants({ variant: "outline" })} type="submit">Применить</button>
        {(searchQuery || state || winner) ? <Link className={buttonVariants({ variant: "ghost" })} href="/admin/quizzes">Сбросить</Link> : null}
      </form>

      {result.items.length === 0 ? <EmptyState>Викторин с такими параметрами нет.</EmptyState> : (
        <>
          <div className="grid gap-3 md:hidden">
            {result.items.map((item) => (
              <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={item.id}>
                <div className="flex items-start justify-between gap-3"><StateToggle item={item} /><span className="text-xs text-stone-500">#{item.id}</span></div>
                <h2 className="mt-3 font-medium">{item.question ?? "Только изображение"}</h2>
                <div className="mt-2 text-sm"><Answer item={item} /></div>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-stone-100 pt-3 text-sm">
                  <div><dt className="text-xs text-stone-500">Победитель</dt><dd>{item.winnerName ?? "—"}</dd></div>
                  <div><dt className="text-xs text-stone-500">Попытки</dt><dd>{item.attemptLimit}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-stone-500">Период</dt><dd>{formatAdminQuizDateTime(item.startsAt)} — {formatAdminQuizDateTime(item.endsAt)}</dd></div>
                </dl>
                <div className="mt-3"><QuizActions item={item} /></div>
              </article>
            ))}
          </div>
          <TableWrap className="hidden md:block">
            <Table>
              <THead><tr><TH>Вопрос</TH><TH>Ответ</TH><TH>Победитель</TH><TH>Попытки</TH><TH>Период</TH><TH>Состояние</TH><TH className="text-right">Действия</TH></tr></THead>
              <TBody>{result.items.map((item) => (
                <TR key={item.id}>
                  <TD>{item.question ?? "Только изображение"}</TD><TD><Answer item={item} /></TD><TD>{item.winnerName ?? "—"}</TD><TD>{item.attemptLimit}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatAdminQuizDateTime(item.startsAt)} — {formatAdminQuizDateTime(item.endsAt)}</TD>
                  <TD><StateToggle item={item} /></TD><TD><QuizActions item={item} /></TD>
                </TR>
              ))}</TBody>
            </Table>
          </TableWrap>
        </>
      )}
      <PaginationNav basePath="/admin/quizzes" itemLabel="викторин" page={result.page} pageSize={result.pageSize} searchParams={{ q: searchQuery || undefined, state, winner }} totalCount={result.totalCount} totalPages={result.totalPages} variant="admin" />
    </div>
  );
}
