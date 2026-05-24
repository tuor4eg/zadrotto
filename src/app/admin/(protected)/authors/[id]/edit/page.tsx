import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { getAuthorById } from "@/db/queries/authors";
import { updateAuthorAction } from "../../actions";
import { AuthorForm } from "../../author-form";
import { getAuthorErrorMessage } from "../../messages";
import { PageHeader } from "../../../admin-ui";

type EditAuthorPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
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

  const author = await getAuthorById(authorId);

  if (!author) {
    notFound();
  }

  const accessProfiles = await getAuthorAccessProfiles({ assignableOnly: !author.isSystem });
  const successMessage = query.updated === "1" ? "Автор сохранен." : null;

  return (
    <div className="mx-auto max-w-2xl">
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
              accessProfiles={accessProfiles}
              submitLabel="Сохранить"
              values={author}
              errorMessage={getAuthorErrorMessage(query.error)}
              successMessage={successMessage}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
