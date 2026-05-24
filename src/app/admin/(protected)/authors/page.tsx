import Link from "next/link";
import { Edit3, Lock, Plus, Trash2, Unlock } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthors } from "@/db/queries/authors";
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

  return (
    <div className="flex flex-col gap-5">
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

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {authors.length === 0 ? (
        <EmptyState>Авторы пока не добавлены.</EmptyState>
      ) : (
        <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
          {authors.map((author) => {
            const isLastSystemAuthor = author.isSystem && systemAuthorsCount <= 1;
            const canDeleteAuthor = author.usageCount === 0 && !isLastSystemAuthor;

            return (
              <div
                key={author.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_230px_minmax(0,190px)_auto]"
              >
              <div className="min-w-0">
                <Link
                  href={`/admin/authors/${author.id}/edit`}
                  className="truncate text-sm font-medium text-stone-950 transition-colors hover:text-stone-700"
                >
                  {author.name}
                </Link>
              </div>
              <div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={author.blockedAt ? "destructive" : "positive"}>
                    {author.blockedAt ? "заблокирован" : "активен"}
                  </Badge>
                  <Badge variant="outline">{author.accessProfileName}</Badge>
                </div>
              </div>
              <div className="text-xs tabular-nums text-stone-500">
                {formatCreatedAt(author.createdAt)}
              </div>
              <div className="flex flex-nowrap justify-end gap-1.5">
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
            </div>
            );
          })}
        </div>
      )}

      <Badge variant="outline">{authors.length} всего</Badge>
    </div>
  );
}
