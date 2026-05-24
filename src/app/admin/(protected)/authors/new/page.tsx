import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { PageHeader } from "../../admin-ui";
import { createAuthorAction } from "../actions";
import { AuthorForm } from "../author-form";
import { getAuthorErrorMessage } from "../messages";

type NewAuthorPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewAuthorPage({ searchParams }: NewAuthorPageProps) {
  const [{ error }, accessProfiles] = await Promise.all([
    searchParams,
    getAuthorAccessProfiles({ assignableOnly: true }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новый автор"
        description="Участник, который сможет оценивать записи."
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
            action={createAuthorAction}
            accessProfiles={accessProfiles}
            submitLabel="Создать"
            errorMessage={getAuthorErrorMessage(error)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
