import { ChartNoAxesColumn, Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getAdminQuizzes } from "@/db/queries/quizzes";

import { PageHeader } from "../admin-ui";
import { deleteQuizAction, toggleQuizAction } from "./actions";

const labels = {
  active: "Активен",
  disabled: "Отключён",
  finished: "Завершён",
  scheduled: "Запланирован",
} as const;

export default async function QuizzesPage() {
  const items = await getAdminQuizzes();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Викторины"
        description="Вопросы для поиска ответа в архиве."
        aside={(
          <Link className={buttonVariants()} href="/admin/quizzes/new">
            <Plus />
            Создать
          </Link>
        )}
      />
      <TableWrap className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <THead>
            <tr>
              <TH>Вопрос</TH>
              <TH>Ответ</TH>
              <TH>Попытки</TH>
              <TH>Период</TH>
              <TH>Состояние</TH>
              <TH className="text-right">Действия</TH>
            </tr>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR key={item.id}>
                <TD>{item.question ?? "Только изображение"}</TD>
                <TD>{item.answerTitle}</TD>
                <TD>{item.attemptLimit}</TD>
                <TD className="text-xs">
                  {item.startsAt.toLocaleString("ru-RU")} — {item.endsAt.toLocaleString("ru-RU")}
                </TD>
                <TD>
                  <form action={toggleQuizAction}>
                    <input type="hidden" name="quizId" value={item.id} />
                    <input type="hidden" name="enabled" value={item.enabled ? "0" : "1"} />
                    <button type="submit">
                      <Badge variant={item.state === "active" ? "default" : "outline"}>
                        {labels[item.state]}
                      </Badge>
                    </button>
                  </form>
                </TD>
                <TD>
                  <div className="flex justify-end gap-2">
                    <Link
                      aria-label="Результаты"
                      className={buttonVariants({ size: "icon", variant: "outline" })}
                      href={`/admin/quizzes/${item.id}`}
                      title="Результаты"
                    >
                      <ChartNoAxesColumn />
                    </Link>
                    <Link
                      aria-label="Изменить"
                      className={buttonVariants({ size: "icon", variant: "outline" })}
                      href={`/admin/quizzes/${item.id}/edit`}
                    >
                      <Edit3 />
                    </Link>
                    <ConfirmAction
                      action={deleteQuizAction}
                      confirmLabel="Удалить"
                      description="Викторина будет удалена без возможности восстановления."
                      fields={[{ name: "quizId", value: item.id }]}
                      title="Удалить викторину?"
                      triggerAriaLabel="Удалить"
                      triggerIcon={<Trash2 />}
                      triggerLabel="Удалить"
                      triggerSize="icon"
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
