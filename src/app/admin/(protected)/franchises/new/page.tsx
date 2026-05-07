import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createFranchiseAction } from "../actions";
import { PageHeader } from "../../admin-ui";
import { FranchiseForm } from "../franchise-form";
import { getFranchiseErrorMessage } from "../messages";

type NewFranchisePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewFranchisePage({ searchParams }: NewFranchisePageProps) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Новая серия"
        description="Базовая карточка серии для будущих связей с записями."
        aside={
        <Link
          href="/admin/franchises"
          className={buttonVariants({ variant: "outline" })}
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
