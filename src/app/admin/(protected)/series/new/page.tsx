import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createFranchiseAction } from "../actions";
import { PageHeader } from "../../admin-ui";
import { FranchiseForm } from "../franchise-form";
import { getFranchiseErrorMessage } from "../messages";
import { getAdminFranchiseParentOptions } from "@/db/queries/franchises";

type NewFranchisePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewFranchisePage({ searchParams }: NewFranchisePageProps) {
  const [{ error }, parentOptions] = await Promise.all([searchParams, getAdminFranchiseParentOptions()]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новая серия"
        description="Базовая карточка серии для будущих связей с записями."
        aside={
          <Link
            href="/admin/series"
            className={`${buttonVariants({ variant: "outline" })} max-sm:hidden`}
          >
            <ArrowLeft />
            Назад
          </Link>
        }
      />

      <Card className="mt-5">
        <CardContent className="pt-5">
          <FranchiseForm
            action={createFranchiseAction}
            submitLabel="Создать"
            errorMessage={getFranchiseErrorMessage(error)}
            parentOptions={parentOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
