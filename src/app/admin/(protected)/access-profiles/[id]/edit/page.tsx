import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorAccessProfileById } from "@/db/queries/author-access-profiles";
import { PageHeader } from "../../../admin-ui";
import { AccessProfileForm } from "../../access-profile-form";
import { updateAuthorAccessProfileAction } from "../../actions";
import { getAuthorAccessProfileErrorMessage } from "../../messages";

type EditAccessProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

function parseProfileId(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function EditAccessProfilePage({
  params,
  searchParams,
}: EditAccessProfilePageProps) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const profileId = parseProfileId(rawId);

  if (!profileId) {
    notFound();
  }

  const profile = await getAuthorAccessProfileById(profileId);

  if (!profile) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Редактирование профиля"
        description={profile.name}
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
            action={updateAuthorAccessProfileAction}
            submitLabel="Сохранить"
            values={profile}
            errorMessage={getAuthorAccessProfileErrorMessage(query.error)}
            successMessage={query.updated === "1" ? "Профиль сохранен." : null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
