import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminFranchises } from "@/db/queries/franchises";
import { PageHeader, EmptyState } from "../admin-ui";
import { deleteFranchiseAction } from "./actions";
import { formatMediaItemsCount, getFranchiseErrorMessage } from "./messages";

type AdminFranchisesPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AdminFranchisesPage({
  searchParams,
}: AdminFranchisesPageProps) {
  const [franchises, params] = await Promise.all([getAdminFranchises(), searchParams]);
  const errorMessage = getFranchiseErrorMessage(params.error);
  const successMessage =
    params.created === "1"
      ? "Серия создана."
      : params.deleted === "1"
        ? "Серия удалена."
        : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Серии"
        description="Серии, к которым можно привязывать записи архива."
        aside={
        <Link
          href="/admin/franchises/new"
          className={buttonVariants({ variant: "default" })}
        >
          <Plus />
          Создать
        </Link>
        }
      />

      {successMessage ? (
        <Alert variant="success">{successMessage}</Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">{errorMessage}</Alert>
      ) : null}

      {franchises.length === 0 ? (
        <EmptyState>Серии пока не добавлены.</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Название</TH>
                <TH className="w-28">Записи</TH>
                <TH className="w-28 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {franchises.map((franchise) => (
                <TR key={franchise.id}>
                  <TD className="truncate font-medium text-stone-950">{franchise.title}</TD>
                  <TD>
                    <Badge variant="outline">{formatMediaItemsCount(franchise.mediaItemsCount)}</Badge>
                  </TD>
                  <TD className="px-2">
                    <div className="flex flex-nowrap justify-end gap-1.5">
                      <Tooltip label="Изменить">
                        <Link
                          href={`/admin/franchises/${franchise.id}/edit`}
                          className={buttonVariants({ variant: "outline", size: "icon" })}
                          aria-label={`Изменить серию ${franchise.title}`}
                        >
                          <Edit3 />
                        </Link>
                      </Tooltip>
                      <form action={deleteFranchiseAction} className="shrink-0">
                        <input type="hidden" name="franchiseId" value={franchise.id} />
                        <Tooltip
                          label={
                            franchise.mediaItemsCount > 0
                              ? "Нельзя удалить: есть записи"
                              : "Удалить"
                          }
                        >
                          <Button
                            type="submit"
                            variant="destructive"
                            size="icon"
                            disabled={franchise.mediaItemsCount > 0}
                            className="shrink-0"
                            aria-label={`Удалить серию ${franchise.title}`}
                          >
                            <Trash2 />
                          </Button>
                        </Tooltip>
                      </form>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
