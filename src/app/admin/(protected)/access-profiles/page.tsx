import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminAuthorAccessProfiles } from "@/db/queries/author-access-profiles";
import { EmptyState, PageHeader } from "../admin-ui";
import { deleteAuthorAccessProfileAction } from "./actions";
import { getAuthorAccessProfileErrorMessage } from "./messages";

type AccessProfilesPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

function getSuccessMessage(input: { created?: string; deleted?: string }) {
  if (input.created === "1") {
    return "Профиль создан.";
  }

  if (input.deleted === "1") {
    return "Профиль удален.";
  }

  return null;
}

export default async function AccessProfilesPage({ searchParams }: AccessProfilesPageProps) {
  const [profiles, params] = await Promise.all([
    getAdminAuthorAccessProfiles(),
    searchParams,
  ]);
  const errorMessage = getAuthorAccessProfileErrorMessage(params.error);
  const successMessage = getSuccessMessage(params);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Профили доступа"
        description="Наборы правил и лимитов для авторов."
        aside={
          <>
            <Badge variant="outline">{profiles.length} всего</Badge>
            <Link
              href="/admin/access-profiles/new"
              className={buttonVariants({ variant: "default" })}
            >
              <Plus />
              Создать
            </Link>
          </>
        }
      />

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {profiles.length === 0 ? (
        <EmptyState>Профили доступа пока не добавлены.</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Профиль</TH>
                <TH className="w-36">Публикация</TH>
                <TH className="w-28">Авторы</TH>
                <TH className="w-28 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {profiles.map((profile) => {
                const canDelete = profile.authorsCount === 0;

                return (
                  <TR key={profile.id}>
                    <TD className="min-w-0 overflow-hidden">
                      <div className="truncate font-medium text-stone-950">{profile.name}</div>
                    </TD>
                    <TD>
                      <Badge
                        variant={profile.canPublishMediaWithoutReview ? "positive" : "outline"}
                      >
                        {profile.canPublishMediaWithoutReview ? "Без проверки" : "Через проверку"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge variant="outline">{profile.authorsCount}</Badge>
                    </TD>
                    <TD className="px-2">
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        <Tooltip label="Изменить">
                          <Link
                            href={`/admin/access-profiles/${profile.id}/edit`}
                            className={buttonVariants({ variant: "outline", size: "icon" })}
                            aria-label={`Изменить профиль ${profile.name}`}
                          >
                            <Edit3 />
                          </Link>
                        </Tooltip>
                        <Tooltip
                          label={
                            canDelete
                              ? "Удалить"
                              : "Нельзя удалить: профиль назначен авторам"
                          }
                        >
                          <ConfirmAction
                            action={deleteAuthorAccessProfileAction}
                            disabled={!canDelete}
                            fields={[{ name: "profileId", value: profile.id }]}
                            title="Удалить профиль?"
                            description={`Профиль «${profile.name}» будет удален. Это возможно только если он не назначен ни одному автору.`}
                            triggerLabel="Удалить"
                            triggerAriaLabel={`Удалить профиль ${profile.name}`}
                            triggerIcon={<Trash2 />}
                            triggerSize="icon"
                            confirmLabel="Удалить профиль"
                          />
                        </Tooltip>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
