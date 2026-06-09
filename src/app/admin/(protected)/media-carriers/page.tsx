import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

import { parseMediaTypeFilter } from "@/app/media-items-catalog-logic";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import {
  getAdminMediaCarriers,
  getAdminMediaCarrierTotalCount,
  getAdminMediaCarrierTypeCounts,
} from "@/db/queries/media-carriers";
import { getMediaTypeLabel, sortMediaTypesByCount } from "@/lib/media/types";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { deleteMediaCarrierAction } from "./actions";
import { MediaCarrierFiltersForm } from "./media-carrier-filters-form";
import { getMediaCarrierErrorMessage } from "./messages";

type MediaCarriersPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    q?: string;
    type?: string;
  }>;
};

function getSuccessMessage(input: { created?: string; deleted?: string }) {
  if (input.created === "1") {
    return "Носитель создан.";
  }

  if (input.deleted === "1") {
    return "Носитель удален.";
  }

  return null;
}

export default async function MediaCarriersPage({ searchParams }: MediaCarriersPageProps) {
  const [params, mediaTypes] = await Promise.all([searchParams, getMediaTypeOptions()]);
  const searchQuery = params.q?.trim() ?? "";
  const mediaTypeFilter = parseMediaTypeFilter(params.type ?? null, mediaTypes);
  const [carriers, mediaTypeCounts, totalCarriersCount] = await Promise.all([
    getAdminMediaCarriers({ mediaTypeFilter, searchQuery }),
    getAdminMediaCarrierTypeCounts(),
    getAdminMediaCarrierTotalCount(),
  ]);
  const errorMessage = getMediaCarrierErrorMessage(params.error);
  const successMessage = getSuccessMessage(params);
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];
  const availableMediaTypes = sortMediaTypesByCount(mediaTypes, mediaTypeCounts)
    .map((mediaType) => ({
      mediaType: mediaType.code,
      count: mediaTypeCounts.find((item) => item.mediaType === mediaType.code)?.count ?? 0,
    }))
    .filter((item) => item.count > 0);
  const hasActiveFilters = Boolean(searchQuery) || mediaTypeFilter !== "all";

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["created", "deleted", "error"]} messages={toastMessages} />

      <PageHeader
        title="Носители"
        description="Форматы и физические носители для будущих скинов карточек."
        aside={
          <>
            <Badge variant="outline">{totalCarriersCount} всего</Badge>
            <Link
              href="/admin/media-carriers/new"
              className={buttonVariants({ variant: "default" })}
            >
              <Plus />
              Создать
            </Link>
          </>
        }
      />

      {totalCarriersCount > 0 ? (
        <MediaCarrierFiltersForm
          availableMediaTypes={availableMediaTypes}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypes}
          searchQuery={searchQuery}
          totalCount={totalCarriersCount}
        />
      ) : null}

      {totalCarriersCount === 0 ? (
        <EmptyState>Носители пока не добавлены.</EmptyState>
      ) : carriers.length === 0 ? (
        <EmptyState>{hasActiveFilters ? "По этим фильтрам носителей нет." : "Носителей нет."}</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Носитель</TH>
                <TH className="w-32">Тип</TH>
                <TH className="w-28">Записи</TH>
                <TH className="w-28 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {carriers.map((carrier) => {
                const canDelete = carrier.mediaItemsCount === 0;

                return (
                  <TR key={carrier.id}>
                    <TD className="min-w-0 overflow-hidden">
                      <div className="truncate font-medium text-stone-950">{carrier.name}</div>
                      <div className="mt-1 truncate font-mono text-xs text-stone-500">
                        {carrier.code}
                      </div>
                      {carrier.description ? (
                        <div className="mt-1 truncate text-xs text-stone-500">
                          {carrier.description}
                        </div>
                      ) : null}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1.5">
                        {carrier.mediaTypes.map((mediaType) => (
                          <Badge key={mediaType} variant="outline">
                            {getMediaTypeLabel(mediaType, mediaTypes)}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD>
                      <Badge variant="outline">{carrier.mediaItemsCount}</Badge>
                    </TD>
                    <TD className="px-2">
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        <Tooltip label="Изменить">
                          <Link
                            href={`/admin/media-carriers/${carrier.id}/edit`}
                            className={buttonVariants({ variant: "outline", size: "icon" })}
                            aria-label={`Изменить носитель ${carrier.name}`}
                          >
                            <Edit3 />
                          </Link>
                        </Tooltip>
                        <Tooltip
                          label={
                            canDelete
                              ? "Удалить"
                              : "Нельзя удалить: носитель выбран в записях"
                          }
                        >
                          <ConfirmAction
                            action={deleteMediaCarrierAction}
                            disabled={!canDelete}
                            fields={[{ name: "carrierId", value: carrier.id }]}
                            title="Удалить носитель?"
                            description={`Носитель «${carrier.name}» будет удален. Это возможно только если он не выбран ни у одной записи.`}
                            triggerLabel="Удалить"
                            triggerAriaLabel={`Удалить носитель ${carrier.name}`}
                            triggerIcon={<Trash2 />}
                            triggerSize="icon"
                            confirmLabel="Удалить носитель"
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
