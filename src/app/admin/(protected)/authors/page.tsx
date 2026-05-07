import Link from "next/link";
import { Edit3, Plus } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthors } from "@/db/queries/authors";
import { EmptyState, PageHeader } from "../admin-ui";
import { getAuthorErrorMessage } from "./messages";

type AdminAuthorsPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function formatCreatedAt(createdAt: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(createdAt);
}

export default async function AdminAuthorsPage({ searchParams }: AdminAuthorsPageProps) {
  const [authors, params] = await Promise.all([getAuthors(), searchParams]);
  const errorMessage = getAuthorErrorMessage(params.error);
  const successMessage = params.created === "1" ? "Автор создан." : null;

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
          {authors.map((author) => (
            <div
              key={author.id}
              className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,150px)_minmax(0,190px)_auto]"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/authors/${author.id}/edit`}
                  className="truncate text-sm font-medium text-stone-950 transition-colors hover:text-stone-700"
                >
                  {author.name}
                </Link>
              </div>
              <div className="min-w-0 font-mono text-xs text-stone-500">{author.code}</div>
              <div className="text-xs tabular-nums text-stone-500">
                {formatCreatedAt(author.createdAt)}
              </div>
              <div className="flex justify-end">
                <Tooltip label="Редактировать">
                  <Link
                    href={`/admin/authors/${author.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "icon" })}
                    aria-label={`Редактировать автора ${author.name}`}
                  >
                    <Edit3 />
                  </Link>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      <Badge variant="outline">{authors.length} всего</Badge>
    </div>
  );
}
