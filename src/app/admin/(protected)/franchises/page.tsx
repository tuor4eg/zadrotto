import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/pagination-nav";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminFranchises } from "@/db/queries/franchises";
import { parsePage } from "@/lib/common/pagination";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { PageHeader, EmptyState } from "../admin-ui";
import { deleteFranchiseAction } from "./actions";
import { AdminFranchiseFiltersForm } from "./franchise-filters-form";
import { formatMediaItemsCount, getFranchiseErrorMessage } from "./messages";

type AdminFranchisesPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    page?: string;
    q?: string;
  }>;
};

const ADMIN_FRANCHISES_PAGE_SIZE = 50;

export default async function AdminFranchisesPage({
  searchParams,
}: AdminFranchisesPageProps) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() ?? "";
  const franchisesResult = await getAdminFranchises({
    page: parsePage(params.page),
    pageSize: ADMIN_FRANCHISES_PAGE_SIZE,
    searchQuery,
  });
  const franchises = franchisesResult.items;
  const errorMessage = getFranchiseErrorMessage(params.error);
  const successMessage =
    params.created === "1"
      ? "Серия создана."
      : params.deleted === "1"
        ? "Серия удалена."
        : null;
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];
  const hasActiveFilters = Boolean(searchQuery);
  const paginationSearchParams = {
    q: searchQuery || undefined,
  };

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["created", "deleted", "error"]} messages={toastMessages} />

      <PageHeader
        title="Серии"
        description="Серии, к которым можно привязывать записи архива."
        aside={
          <>
            <Badge variant="outline">{franchisesResult.totalCount} всего</Badge>
            <Link
              href="/admin/franchises/new"
              className={buttonVariants({ variant: "default" })}
            >
              <Plus />
              Создать
            </Link>
          </>
        }
      />

      {franchisesResult.totalCount > 0 || hasActiveFilters ? (
        <AdminFranchiseFiltersForm searchQuery={searchQuery} />
      ) : null}

      {franchisesResult.totalCount === 0 && !hasActiveFilters ? (
        <EmptyState>Серии пока не добавлены.</EmptyState>
      ) : franchises.length === 0 ? (
        <EmptyState>По этому поиску серий нет.</EmptyState>
      ) : (
        <>
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
                    <TD className="min-w-0 overflow-hidden">
                      <div className="truncate font-medium text-stone-950">{franchise.title}</div>
                      {franchise.originalTitle ? (
                        <div className="mt-1 truncate text-xs text-stone-500">
                          {franchise.originalTitle}
                        </div>
                      ) : null}
                    </TD>
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
          <PaginationNav
            basePath="/admin/franchises"
            itemLabel="серий"
            page={franchisesResult.page}
            pageSize={franchisesResult.pageSize}
            searchParams={paginationSearchParams}
            totalCount={franchisesResult.totalCount}
            totalPages={franchisesResult.totalPages}
          />
        </>
      )}
    </div>
  );
}
