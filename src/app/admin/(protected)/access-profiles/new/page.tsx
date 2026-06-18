import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../../admin-ui";
import { AccessProfileForm } from "../access-profile-form";
import { createAuthorAccessProfileAction } from "../actions";
import { getAuthorAccessProfileErrorMessage } from "../messages";

type NewAccessProfilePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewAccessProfilePage({
  searchParams,
}: NewAccessProfilePageProps) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новый профиль"
        description="Набор правил и лимитов для авторов."
        aside={
          <Link
            href="/admin/access-profiles"
            className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
          >
            <ArrowLeft />
            Назад
          </Link>
        }
      />

      <Card className="mt-5">
        <CardContent className="pt-5">
          <AccessProfileForm
            action={createAuthorAccessProfileAction}
            submitLabel="Создать"
            errorMessage={getAuthorAccessProfileErrorMessage(error)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
