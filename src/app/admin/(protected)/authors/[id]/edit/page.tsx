import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthorById } from "@/db/queries/authors";
import { listAuthorPermissions } from "@/lib/author-permission-service";
import {
  AUTHOR_PERMISSION_LABELS,
  PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION,
} from "@/lib/author-permissions";
import { updateAuthorAction, updateAuthorPermissionAction } from "../../actions";
import { AuthorForm } from "../../author-form";
import { getAuthorErrorMessage } from "../../messages";
import { PageHeader } from "../../../admin-ui";

type EditAuthorPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    permissions?: string;
    updated?: string;
  }>;
};

function parseAuthorId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function EditAuthorPage({
  params,
  searchParams,
}: EditAuthorPageProps) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const authorId = parseAuthorId(rawId);

  if (!authorId) {
    notFound();
  }

  const [author, permissions] = await Promise.all([
    getAuthorById(authorId),
    listAuthorPermissions(authorId),
  ]);

  if (!author) {
    notFound();
  }

  const hasPublishPermission = permissions.includes(PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION);
  const successMessage =
    query.updated === "1"
      ? "Автор сохранен."
      : query.permissions === "1"
        ? "Права автора сохранены."
        : null;

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <PageHeader
          title="Редактирование автора"
          description={author.name}
          aside={
            <Link
              href="/admin/authors"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft />
              Назад
            </Link>
          }
        />

        <Card className="mt-5">
          <CardContent className="pt-5">
            <AuthorForm
              action={updateAuthorAction}
              submitLabel="Сохранить"
              values={author}
              errorMessage={getAuthorErrorMessage(query.error)}
              successMessage={successMessage}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Права</CardTitle>
          <Badge variant={hasPublishPermission ? "positive" : "outline"}>
            {hasPublishPermission ? "Есть" : "Нет"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4">
          {query.error === "invalid-permission" ? (
            <Alert variant="destructive">{getAuthorErrorMessage(query.error)}</Alert>
          ) : null}
          <form action={updateAuthorPermissionAction}>
            <input type="hidden" name="authorId" value={author.id} />
            <input
              type="hidden"
              name="permission"
              value={PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION}
            />
            <input
              type="hidden"
              name="enabled"
              value={hasPublishPermission ? "0" : "1"}
            />
            <Button
              type="submit"
              variant={hasPublishPermission ? "positive" : "outline"}
              className="w-full justify-start"
              aria-pressed={hasPublishPermission}
            >
              {hasPublishPermission ? <Check /> : <ShieldCheck />}
              <span>{AUTHOR_PERMISSION_LABELS[PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION]}</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
