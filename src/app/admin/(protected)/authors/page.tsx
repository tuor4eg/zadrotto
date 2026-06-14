import Link from "next/link";
import { Edit3, Eye, Lock, Plus, Trash2, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { getAuthors, type AuthorActivityFilter } from "@/db/queries/authors";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { blockAuthorAction, deleteAuthorAction, unblockAuthorAction } from "./actions";
import { AuthorFiltersForm } from "./author-filters-form";
import { getAuthorErrorMessage } from "./messages";

type AdminAuthorsPageProps = {
  searchParams: Promise<{
    activity?: string;
    created?: string;
    error?: string;
    profile?: string;
    updated?: string;
  }>;
};

type AdminAuthor = Awaited<ReturnType<typeof getAuthors>>[number];

const AUTHOR_ACTIVITY_FILTERS = ["active", "blocked"] as const;

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

function parseAuthorActivityFilter(value?: string): AuthorActivityFilter | "all" {
  return AUTHOR_ACTIVITY_FILTERS.some((filter) => filter === value)
    ? (value as AuthorActivityFilter)
    : "all";
}

function parseAuthorAccessProfileFilter(
  value: string | undefined,
  accessProfiles: Array<{ id: number }>,
) {
  if (!value) {
    return null;
  }

  const accessProfileId = Number(value);

  return accessProfiles.some((profile) => profile.id === accessProfileId) ? accessProfileId : null;
}

function AuthorActions({
  author,
  canDeleteAuthor,
  isLastSystemAuthor,
}: {
  author: AdminAuthor;
  canDeleteAuthor: boolean;
  isLastSystemAuthor: boolean;
}) {
  return (
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
  );
}

export default async function AdminAuthorsPage({ searchParams }: AdminAuthorsPageProps) {
  const [params, accessProfiles, allAuthors] = await Promise.all([
    searchParams,
    getAuthorAccessProfiles(),
    getAuthors(),
  ]);
  const activityFilter = parseAuthorActivityFilter(params.activity);
  const accessProfileFilter = parseAuthorAccessProfileFilter(params.profile, accessProfiles);
  const hasActiveFilters = activityFilter !== "all" || accessProfileFilter !== null;
  const authors = hasActiveFilters
    ? await getAuthors({
        accessProfileId: accessProfileFilter,
        activity: activityFilter,
      })
    : allAuthors;
  const errorMessage = getAuthorErrorMessage(params.error);
  const successMessage = getSuccessMessage(params);
  const systemAuthorsCount = allAuthors.filter((author) => author.isSystem).length;
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

      <AuthorFiltersForm
        accessProfileFilter={accessProfileFilter}
        accessProfiles={accessProfiles}
        activityFilter={activityFilter}
      />

      {authors.length === 0 ? (
        <EmptyState>
          {hasActiveFilters ? "По этим фильтрам авторов нет." : "Авторы пока не добавлены."}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {authors.map((author) => {
              const isLastSystemAuthor = author.isSystem && systemAuthorsCount <= 1;
              const canDeleteAuthor = author.usageCount === 0 && !isLastSystemAuthor;

              return (
                <div
                  key={author.id}
                  className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/authors/${author.id}`}
                      className="block break-words font-medium text-stone-950 underline-offset-2 transition-colors hover:text-stone-700 hover:underline"
                    >
                      {author.name}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant={author.blockedAt ? "destructive" : "positive"}>
                        {author.blockedAt ? "неактивен" : "активен"}
                      </Badge>
                      <Badge variant="outline">{author.accessProfileName}</Badge>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-stone-100 pt-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                          Создан
                        </div>
                        <div className="text-xs tabular-nums text-stone-500">
                          {formatCreatedAt(author.createdAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                          Данные
                        </div>
                        <Badge variant="outline">{author.usageCount}</Badge>
                      </div>
                    </div>

                    <AuthorActions
                      author={author}
                      canDeleteAuthor={canDeleteAuthor}
                      isLastSystemAuthor={isLastSystemAuthor}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <TableWrap className="hidden sm:block">
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
                        <AuthorActions
                          author={author}
                          canDeleteAuthor={canDeleteAuthor}
                          isLastSystemAuthor={isLastSystemAuthor}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}

      <Badge variant="outline">{authors.length} всего</Badge>
    </div>
  );
}
