import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

import {
  isAuthorOnlyCatalogSort,
  parseCatalogSort,
  parseMediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { PaginationNav } from "@/components/pagination-nav";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorOptions } from "@/db/queries/authors";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getAdminMediaItems, getAdminMediaTypeCounts } from "@/db/queries/media-items";
import { getMediaTypeLabel, sortMediaTypesByCount } from "@/lib/media-types";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { parsePage } from "@/lib/pagination";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/publication-status";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { deleteAdminMediaItemAction } from "./actions";
import { AdminMediaFiltersForm } from "./media-filters-form";
import { getAdminMediaErrorMessage } from "./messages";

type AdminMediaPageProps = {
  searchParams: Promise<{
    deleted?: string;
    error?: string;
    author?: string;
    carrier?: string;
    page?: string;
    q?: string;
    sort?: string;
    type?: string;
    updated?: string;
    created?: string;
  }>;
};

const ADMIN_MEDIA_PAGE_SIZE = 50;

function parseAuthorFilter(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMediaCarrierFilter(
  value: string | undefined,
  input: {
    mediaCarriers: Awaited<ReturnType<typeof getMediaCarrierOptions>>;
    mediaTypeFilter: ReturnType<typeof parseMediaTypeFilter>;
  },
) {
  if (!value || input.mediaTypeFilter === "all") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return input.mediaCarriers.some(
    (carrier) => carrier.id === parsed && carrier.mediaType === input.mediaTypeFilter,
  )
    ? parsed
    : null;
}

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
  const [params, mediaTypes, mediaCarriers] = await Promise.all([
    searchParams,
    getMediaTypeOptions(),
    getMediaCarrierOptions(),
  ]);
  const searchQuery = params.q?.trim() ?? "";
  const authorFilter = parseAuthorFilter(params.author);
  const mediaTypeFilter = parseMediaTypeFilter(params.type ?? null, mediaTypes);
  const mediaCarrierFilter = parseMediaCarrierFilter(params.carrier, {
    mediaCarriers,
    mediaTypeFilter,
  });
  const parsedSort = parseCatalogSort(params.sort ?? null);
  const sort = isAuthorOnlyCatalogSort(parsedSort) ? "title" : parsedSort;
  const [mediaResult, mediaTypeCounts, authors] = await Promise.all([
    getAdminMediaItems({
      authorId: authorFilter ?? undefined,
      mediaCarrierId: mediaCarrierFilter ?? undefined,
      mediaTypeFilter,
      page: parsePage(params.page),
      pageSize: ADMIN_MEDIA_PAGE_SIZE,
      searchQuery,
      sort,
    }),
    getAdminMediaTypeCounts({ authorId: authorFilter ?? undefined }),
    getAuthorOptions(),
  ]);
  const items = mediaResult.items;
  const totalItemsCount = mediaTypeCounts.reduce((total, item) => total + item.count, 0);
  const errorMessage = getAdminMediaErrorMessage(params.error);
  const successMessage =
    params.created === "1"
      ? "Запись создана."
      : params.updated === "1"
      ? "Запись сохранена."
      : params.deleted === "1"
        ? "Запись удалена."
        : null;
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
  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(authorFilter) ||
    Boolean(mediaCarrierFilter) ||
    mediaTypeFilter !== "all" ||
    sort !== "title";
  const paginationSearchParams = {
    author: authorFilter ? String(authorFilter) : undefined,
    carrier: mediaCarrierFilter ? String(mediaCarrierFilter) : undefined,
    q: searchQuery || undefined,
    sort: sort !== "title" ? sort : undefined,
    type: mediaTypeFilter !== "all" ? mediaTypeFilter : undefined,
  };

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts
        clearParams={["created", "deleted", "error", "updated"]}
        messages={toastMessages}
      />

      <PageHeader
        title="Записи"
        aside={
          <>
            <Badge variant="outline">{totalItemsCount} всего</Badge>
            <Link
              href="/admin/media/new"
              className={buttonVariants()}
            >
              <Plus />
              Создать
            </Link>
          </>
        }
      />

      {totalItemsCount > 0 || authors.length > 0 ? (
        <AdminMediaFiltersForm
          availableMediaTypes={availableMediaTypes}
          authorFilter={authorFilter}
          authors={authors}
          mediaCarrierFilter={mediaCarrierFilter}
          mediaCarriers={mediaCarriers}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypes}
          searchQuery={searchQuery}
          sort={sort}
          totalCount={totalItemsCount}
        />
      ) : null}

      {totalItemsCount === 0 ? (
        <EmptyState>Записей пока нет.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{hasActiveFilters ? "По этим фильтрам записей нет." : "Записей нет."}</EmptyState>
      ) : (
        <>
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
                {items.map((item) => (
                <TR key={item.id}>
                  <TD className="min-w-0 overflow-hidden">
                    <div className="min-w-0 overflow-hidden">
                      <div className="truncate font-medium text-stone-950">{item.title}</div>
                      {item.originalTitle ? (
                        <div className="mt-1 truncate text-xs text-stone-500">{item.originalTitle}</div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
                        <Badge variant="outline">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
                        <Badge variant={getStatusBadgeVariant(item.publicationStatus)}>
                          {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 overflow-hidden text-xs text-stone-500">
                        {item.franchiseTitle ? (
                          <span className="truncate">Серия: {item.franchiseTitle}</span>
                        ) : null}
                        {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                        {item.mediaCarrierName ? (
                          <span className="truncate">Носитель: {item.mediaCarrierName}</span>
                        ) : null}
                        <span>{formatRatingsCount(item.ratingsCount)}</span>
                        {item.averageScore !== null ? (
                          <span>Ср.: {formatScore(item.averageScore)}</span>
                        ) : null}
                        {item.authorName ? (
                          <span className="truncate">Автор: {item.authorName}</span>
                        ) : null}
                      </div>
                    </div>
                  </TD>
                  <TD className="hidden sm:table-cell">
                    <Badge variant="outline">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
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
          <PaginationNav
            basePath="/admin/media"
            page={mediaResult.page}
            pageSize={mediaResult.pageSize}
            searchParams={paginationSearchParams}
            totalCount={mediaResult.totalCount}
            totalPages={mediaResult.totalPages}
          />
        </>
      )}
    </div>
  );
}
