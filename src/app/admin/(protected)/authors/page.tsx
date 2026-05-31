import Link from "next/link";
import { Edit3, Eye, Lock, Plus, Trash2, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthors } from "@/db/queries/authors";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { blockAuthorAction, deleteAuthorAction, unblockAuthorAction } from "./actions";
import { getAuthorErrorMessage } from "./messages";

type AdminAuthorsPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
    updated?: string;
  }>;
};

function formatCreatedAt(createdAt: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(createdAt);
}

function getSuccessMessage(input: {
  created?: string;
  updated?: string;
}) {
  if (input.created === "1") {
    return "Автор создан.";
  }

  if (input.updated === "blocked") {
    return "Автор заблокирован.";
  }

  if (input.updated === "unblocked") {
    return "Автор разблокирован.";
  }

  if (input.updated === "deleted") {
    return "Автор удален.";
  }

  return null;
}

export default async function AdminAuthorsPage({ searchParams }: AdminAuthorsPageProps) {
  const [authors, params] = await Promise.all([getAuthors(), searchParams]);
  const errorMessage = getAuthorErrorMessage(params.error);
  const successMessage = getSuccessMessage(params);
  const systemAuthorsCount = authors.filter((author) => author.isSystem).length;
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["created", "error", "updated"]} messages={toastMessages} />

      <PageHeader
        title="Авторы"
        description="Участники, которые могут ставить оценки."
        aside={
          <Link
            href="/admin/authors/new"
            className={buttonVariants({ variant: "default" })}
          >
            <Plus />
            Создать
          </Link>
        }
      />

      {authors.length === 0 ? (
        <EmptyState>Авторы пока не добавлены.</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Автор</TH>
                <TH className="w-60">Профиль</TH>
                <TH className="w-48">Создан</TH>
                <TH className="w-56 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {authors.map((author) => {
                const isLastSystemAuthor = author.isSystem && systemAuthorsCount <= 1;
                const canDeleteAuthor = author.usageCount === 0 && !isLastSystemAuthor;

                return (
                  <TR key={author.id}>
                    <TD className="min-w-0 overflow-hidden">
                      <Link
                        href={`/admin/authors/${author.id}`}
                        className="block truncate font-medium text-stone-950 underline-offset-2 transition-colors hover:text-stone-700 hover:underline"
                      >
                        {author.name}
                      </Link>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={author.blockedAt ? "destructive" : "positive"}>
                          {author.blockedAt ? "заблокирован" : "активен"}
                        </Badge>
                        <Badge variant="outline">{author.accessProfileName}</Badge>
                      </div>
                    </TD>
                    <TD className="text-xs tabular-nums text-stone-500">
                      {formatCreatedAt(author.createdAt)}
                    </TD>
                    <TD className="px-2">
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        <Tooltip label="Смотреть">
                          <Link
                            href={`/admin/authors/${author.id}`}
                            className={buttonVariants({ variant: "outline", size: "icon" })}
                            aria-label={`Смотреть автора ${author.name}`}
                          >
                            <Eye />
                          </Link>
                        </Tooltip>
                        <Tooltip label="Редактировать">
                          <Link
                            href={`/admin/authors/${author.id}/edit`}
                            className={buttonVariants({ variant: "outline", size: "icon" })}
                            aria-label={`Редактировать автора ${author.name}`}
                          >
                            <Edit3 />
                          </Link>
                        </Tooltip>
                        {author.isSystem ? (
                          <Tooltip label="Системного автора нельзя заблокировать">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              disabled
                              aria-label={`Системного автора ${author.name} нельзя заблокировать`}
                            >
                              <Lock />
                            </Button>
                          </Tooltip>
                        ) : author.blockedAt ? (
                          <form action={unblockAuthorAction} className="shrink-0">
                            <input type="hidden" name="authorId" value={author.id} />
                            <Tooltip label="Разблокировать">
                              <Button
                                type="submit"
                                variant="outline"
                                size="icon"
                                aria-label={`Разблокировать автора ${author.name}`}
                              >
                                <Unlock />
                              </Button>
                            </Tooltip>
                          </form>
                        ) : (
                          <form action={blockAuthorAction} className="shrink-0">
                            <input type="hidden" name="authorId" value={author.id} />
                            <Tooltip label="Заблокировать">
                              <Button
                                type="submit"
                                variant="destructive"
                                size="icon"
                                aria-label={`Заблокировать автора ${author.name}`}
                              >
                                <Lock />
                              </Button>
                            </Tooltip>
                          </form>
                        )}
                        <Tooltip
                          label={
                            isLastSystemAuthor
                              ? "Нельзя удалить последнего системного автора"
                              : author.usageCount > 0
                              ? "Нельзя удалить: есть данные"
                              : "Удалить"
                          }
                        >
                          <ConfirmAction
                            action={deleteAuthorAction}
                            disabled={!canDeleteAuthor}
                            fields={[{ name: "authorId", value: author.id }]}
                            title="Удалить автора?"
                            description={`Автор «${author.name}» будет полностью удален вместе с токенами доступа. Это возможно только если у него нет оценок и добавленных записей.`}
                            triggerLabel="Удалить"
                            triggerAriaLabel={`Удалить автора ${author.name}`}
                            triggerIcon={<Trash2 />}
                            triggerSize="icon"
                            confirmLabel="Удалить автора"
                          />
                        </Tooltip>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Badge variant="outline">{authors.length} всего</Badge>
    </div>
  );
}
