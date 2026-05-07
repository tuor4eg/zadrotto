import Link from "next/link";
import { Edit3, Trash2 } from "lucide-react";

import {
  filterCatalogItems,
  parseCatalogSort,
  parseMediaTypeFilter,
  sortCatalogItems,
} from "@/app/media-items-catalog-logic";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminMediaItems } from "@/db/queries/media-items";
import { MEDIA_TYPES, MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/publication-status";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";
import { EmptyState, PageHeader } from "../admin-ui";
import { deleteAdminMediaItemAction } from "./actions";
import { AdminMediaFiltersForm } from "./media-filters-form";
import { getAdminMediaErrorMessage } from "./messages";

type AdminMediaPageProps = {
  searchParams: Promise<{
    deleted?: string;
    error?: string;
    q?: string;
    sort?: string;
    type?: string;
    updated?: string;
  }>;
};

function getStatusBadgeVariant(status: keyof typeof PUBLICATION_STATUS_VALUE_LABELS) {
  if (status === "published") {
    return "positive" as const;
  }

  if (status === "submitted") {
    return "warning" as const;
  }

  if (status === "rejected") {
    return "destructive" as const;
  }

  return "outline" as const;
}

export default async function AdminMediaPage({ searchParams }: AdminMediaPageProps) {
  const [items, params] = await Promise.all([getAdminMediaItems(), searchParams]);
  const searchQuery = params.q?.trim() ?? "";
  const mediaTypeFilter = parseMediaTypeFilter(params.type ?? null);
  const sort = parseCatalogSort(params.sort ?? null);
  const errorMessage = getAdminMediaErrorMessage(params.error);
  const successMessage =
    params.updated === "1"
      ? "Запись сохранена."
      : params.deleted === "1"
        ? "Запись удалена."
        : null;
  const filteredItems = filterCatalogItems(items, searchQuery, mediaTypeFilter, "all");
  const visibleItems = sortCatalogItems(filteredItems, sort);
  const availableMediaTypes = MEDIA_TYPES
    .map((mediaType) => ({
      mediaType,
      count: items.filter((item) => item.mediaType === mediaType).length,
    }))
    .filter((item) => item.count > 0);
  const hasActiveFilters = Boolean(searchQuery) || mediaTypeFilter !== "all" || sort !== "title";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Записи"
        description="Архивные записи с теми же фильтрами, что и в каталоге."
        aside={<Badge variant="outline">{items.length} всего</Badge>}
      />

      {items.length > 0 ? (
        <AdminMediaFiltersForm
          availableMediaTypes={availableMediaTypes}
          mediaTypeFilter={mediaTypeFilter}
          searchQuery={searchQuery}
          sort={sort}
          totalCount={items.length}
        />
      ) : null}

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {items.length === 0 ? (
        <EmptyState>Записей пока нет.</EmptyState>
      ) : visibleItems.length === 0 ? (
        <EmptyState>{hasActiveFilters ? "По этим фильтрам записей нет." : "Записей нет."}</EmptyState>
      ) : (
        <TableWrap>
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Название</TH>
                <TH className="hidden w-24 sm:table-cell">Тип</TH>
                <TH className="hidden w-28 md:table-cell">Статус</TH>
                <TH className="w-28 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {visibleItems.map((item) => (
                <TR key={item.id}>
                  <TD className="min-w-0 overflow-hidden">
                    <div className="min-w-0 overflow-hidden">
                      <div className="truncate font-medium text-stone-950">{item.title}</div>
                      {item.originalTitle ? (
                        <div className="mt-1 truncate text-xs text-stone-500">{item.originalTitle}</div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
                        <Badge variant="outline">{MEDIA_TYPE_LABELS[item.mediaType]}</Badge>
                        <Badge variant={getStatusBadgeVariant(item.publicationStatus)}>
                          {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 overflow-hidden text-xs text-stone-500">
                        <span className="break-all font-mono leading-5">{item.code}</span>
                        {item.franchiseTitle ? (
                          <span className="truncate">Серия: {item.franchiseTitle}</span>
                        ) : null}
                        {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                        <span>{formatRatingsCount(item.ratingsCount)}</span>
                        {item.averageScore !== null ? (
                          <span>Ср.: {formatScore(item.averageScore)}</span>
                        ) : null}
                        {item.authorName ? (
                          <span className="truncate">
                            Автор: {item.authorName}
                            {item.authorCode ? ` (${item.authorCode})` : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TD>
                  <TD className="hidden sm:table-cell">
                    <Badge variant="outline">{MEDIA_TYPE_LABELS[item.mediaType]}</Badge>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <Badge variant={getStatusBadgeVariant(item.publicationStatus)}>
                      {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
                    </Badge>
                  </TD>
                  <TD className="px-2">
                    <div className="flex flex-nowrap justify-end gap-1.5">
                      <Tooltip label="Изменить">
                        <Link
                          href={`/admin/media/${item.id}/edit`}
                          className={buttonVariants({ variant: "outline", size: "icon" })}
                          aria-label={`Изменить запись ${item.title}`}
                        >
                          <Edit3 />
                        </Link>
                      </Tooltip>
                      <form action={deleteAdminMediaItemAction} className="shrink-0">
                        <input type="hidden" name="mediaItemId" value={item.id} />
                        <Tooltip
                          label={
                            item.ratingsCount > 0
                              ? "Нельзя удалить: есть оценки"
                              : "Удалить"
                          }
                        >
                          <Button
                            type="submit"
                            variant="destructive"
                            size="icon"
                            disabled={item.ratingsCount > 0}
                            className="shrink-0"
                            aria-label={`Удалить запись ${item.title}`}
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
