import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminAuthorProfileById } from "@/db/queries/authors";
import { PageHeader } from "../../admin-ui";

type AdminAuthorPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function parseAuthorId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function getValidDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: Date | string | null | undefined) {
  const date = getValidDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-stone-950">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdminAuthorPage({ params }: AdminAuthorPageProps) {
  const { id: rawId } = await params;
  const authorId = parseAuthorId(rawId);

  if (!authorId) {
    notFound();
  }

  const author = await getAdminAuthorProfileById(authorId);

  if (!author) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={author.name}
        description={`Авторский профиль: ${author.code}`}
        aside={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/authors"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft />
              Авторы
            </Link>
            <Link
              href={`/admin/authors/${author.id}/edit`}
              className={buttonVariants({ variant: "default" })}
            >
              <Edit3 />
              Редактировать
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Сводка</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500">Статус</dt>
              <dd className="mt-1">
                <Badge variant={author.blockedAt ? "destructive" : "positive"}>
                  {author.blockedAt ? "заблокирован" : "активен"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Профиль доступа</dt>
              <dd className="mt-1">
                <Badge variant="outline">{author.accessProfileName}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Зарегистрирован</dt>
              <dd className="mt-1 font-medium text-stone-950">
                {formatDateTime(author.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Последняя активность</dt>
              <dd className="mt-1 font-medium text-stone-950">
                {formatDateTime(author.lastActivityAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Создано записей" value={author.createdMediaItemsCount} />
        <StatCard label="Опубликовано" value={author.publishedMediaItemsCount} />
      </div>
    </div>
  );
}
