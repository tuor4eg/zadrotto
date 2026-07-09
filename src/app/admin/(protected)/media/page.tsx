import Link from "next/link";
import { Edit3, Plus, Trash2 } from "lucide-react";

import {
  isAuthorOnlyCatalogSort,
  parseCatalogSort,
  parseMediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PaginationNav } from "@/components/pagination-nav";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorOptions } from "@/db/queries/authors";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getAdminMediaItems, getAdminMediaTypeCounts } from "@/db/queries/media-items";
import { getMediaTypeLabel, sortMediaTypesByCount } from "@/lib/media/types";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { parsePage } from "@/lib/common/pagination";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/media/publication-status";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
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
type AdminMediaItem = Awaited<ReturnType<typeof getAdminMediaItems>>["items"][number];

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
    (carrier) => carrier.id === parsed && carrier.mediaTypes.includes(input.mediaTypeFilter),
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

function AdminMediaCoverThumb({
  coverUrl,
  size = "sm",
  title,
}: {
  coverUrl: string | null;
  size?: "md" | "sm";
  title: string;
}) {
  const className =
    size === "md"
      ? "h-20 w-14 rounded-sm border border-stone-200 bg-stone-100 object-cover shadow-sm"
      : "h-9 w-7 rounded-sm border border-stone-200 bg-stone-100 object-cover shadow-sm";

  if (!coverUrl) {
    return (
      <span
        aria-label={`Обложка не добавлена: ${title}`}
        className={
          size === "md"
            ? "inline-flex h-20 w-14 items-center justify-center rounded-sm border border-dashed border-stone-300 bg-stone-50 text-[10px] font-medium uppercase leading-none text-stone-400"
            : "inline-flex h-9 w-7 items-center justify-center rounded-sm border border-dashed border-stone-300 bg-stone-50 text-[9px] font-medium uppercase leading-none text-stone-400"
        }
        title="Обложка не добавлена"
      >
        нет
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={`Обложка: ${title}`}
      className={className}
      loading="lazy"
    />
  );
}

function AdminMediaItemActions({ item }: { item: AdminMediaItem }) {
  const canDelete = item.publicationStatus !== "published";

  return (
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
      {canDelete ? (
        <Tooltip label="Удалить вместе со связанными материалами">
          <ConfirmAction
            action={deleteAdminMediaItemAction}
            className="shrink-0"
            confirmLabel="Удалить"
            description={`Запись «${item.title}» будет удалена вместе со связанными оценками, рецензиями и пользовательскими отметками. Это действие нельзя отменить.`}
            fields={[{ name: "mediaItemId", value: item.id }]}
            title="Удалить запись?"
            triggerAriaLabel={`Удалить запись ${item.title}`}
            triggerIcon={<Trash2 />}
            triggerLabel="Удалить"
            triggerSize="icon"
          />
        </Tooltip>
      ) : (
        <Tooltip label="Сначала снимите запись с публикации">
          <Button
            type="button"
            variant="destructive"
            size="icon"
            disabled
            className="shrink-0"
            aria-label={`Удалить запись ${item.title}`}
          >
            <Trash2 />
          </Button>
        </Tooltip>
      )}
    </div>
  );
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
          <div className="grid gap-3 sm:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <AdminMediaCoverThumb
                      coverUrl={item.coverThumbUrl ?? item.coverUrl}
                      size="md"
                      title={item.title}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium leading-5 text-stone-950">
                      {item.title}
                    </div>
                    {item.originalTitle ? (
                      <div className="mt-1 break-words text-xs leading-5 text-stone-500">
                        {item.originalTitle}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
                      <Badge variant={getStatusBadgeVariant(item.publicationStatus)}>
                        {PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus]}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-stone-100 pt-3">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                    {item.franchises.length > 0 ? (
                      <span className="break-words">
                        Серии: {item.franchises.map((franchise) => franchise.title).join(", ")}
                      </span>
                    ) : null}
                    {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                    {item.mediaCarrierName ? (
                      <span className="break-words">Носитель: {item.mediaCarrierName}</span>
                    ) : null}
                    <span>{formatRatingsCount(item.ratingsCount)}</span>
                    {item.averageScore !== null ? (
                      <span>Ср.: {formatScore(item.averageScore)}</span>
                    ) : null}
                    {item.authorName ? (
                      <span className="break-words">Автор: {item.authorName}</span>
                    ) : null}
                  </div>

                  <AdminMediaItemActions item={item} />
                </div>
              </div>
            ))}
          </div>

          <TableWrap className="hidden sm:block">
            <Table className="table-fixed">
              <THead>
                <tr>
                  <TH className="w-12 px-2 text-center">Обл.</TH>
                  <TH>Название</TH>
                  <TH className="hidden w-24 sm:table-cell">Тип</TH>
                  <TH className="hidden w-28 md:table-cell">Статус</TH>
                  <TH className="w-28 px-2 text-right">Действия</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((item) => (
                  <TR key={item.id}>
                    <TD className="px-2 text-center">
                      <AdminMediaCoverThumb
                        coverUrl={item.coverThumbUrl ?? item.coverUrl}
                        title={item.title}
                      />
                    </TD>
                    <TD className="min-w-0 overflow-hidden">
                      <div className="min-w-0 overflow-hidden">
                        <div className="truncate font-medium text-stone-950">{item.title}</div>
                        {item.originalTitle ? (
                          <div className="mt-1 truncate text-xs text-stone-500">
                            {item.originalTitle}
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 overflow-hidden text-xs text-stone-500">
                          {item.franchises.length > 0 ? (
                            <span className="truncate">
                              Серии: {item.franchises.map((franchise) => franchise.title).join(", ")}
                            </span>
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
                      <AdminMediaItemActions item={item} />
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
