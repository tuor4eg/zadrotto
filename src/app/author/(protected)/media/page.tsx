import Link from "next/link";
import { Edit3, Eye, Plus, Send, Trash2, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PaginationNav } from "@/components/pagination-nav";
import { Tooltip } from "@/components/ui/tooltip";
import { getAuthorMediaItems } from "@/db/queries/media-items";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import {
  filterAuthorMediaItems,
  parseAuthorMediaStatusFilter,
  parseAuthorMediaTypeFilter,
} from "@/lib/authors/media-filters";
import { isAuthorEditablePublicationStatus } from "@/lib/forms/author-media";
import {
  canAuthorDeleteMediaItem,
  canAuthorRequestPublication,
  canAuthorWithdrawPublicationRequest,
  getAuthorMediaPublicationConfirmDescription,
} from "@/lib/authors/media-publication";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getMediaTypeLabel, sortMediaTypesByCount } from "@/lib/media/types";
import {
  PUBLICATION_STATUS_VALUE_LABELS,
  type PublicationStatus,
} from "@/lib/media/publication-status";
import { clampPage, getOffset, getTotalPages, parsePage, parsePageSize } from "@/lib/common/pagination";
import {
  deleteAuthorMediaItemAction,
  publishAuthorMediaItemAction,
  withdrawAuthorMediaItemAction,
} from "./actions";
import { AuthorToasts, type AuthorToast } from "../author-toasts";
import { AuthorMediaFiltersForm } from "./author-media-filters-form";

const AUTHOR_MEDIA_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const DEFAULT_AUTHOR_MEDIA_PAGE_SIZE = 24;

type AuthorMediaPageProps = {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
    page?: string;
    pageSize?: string;
    published?: string;
    submitted?: string;
    withdrawn?: string;
    deleted?: string;
    status?: string;
    type?: string;
    q?: string;
  }>;
};

const STATUS_BADGE_VARIANTS: Record<
  PublicationStatus,
  "default" | "outline" | "positive" | "warning" | "destructive"
> = {
  private: "outline",
  submitted: "warning",
  published: "positive",
  rejected: "destructive",
};

function getStatusToast(params: Awaited<AuthorMediaPageProps["searchParams"]>): AuthorToast | null {
  if (params.created === "1") {
    return { id: "created", tone: "success", text: "Запись создана." };
  }

  if (params.updated === "1") {
    return { id: "updated", tone: "success", text: "Запись сохранена." };
  }

  if (params.published === "1") {
    return { id: "published", tone: "success", text: "Запись опубликована." };
  }

  if (params.submitted === "1") {
    return { id: "submitted", tone: "success", text: "Запись отправлена на проверку." };
  }

  if (params.withdrawn === "1") {
    return { id: "withdrawn", tone: "success", text: "Запись снова стала черновиком." };
  }

  if (params.deleted === "1") {
    return { id: "deleted", tone: "success", text: "Черновик удален." };
  }

  if (params.error === "locked") {
    return { id: "locked", tone: "error", text: "Эту запись сейчас нельзя редактировать." };
  }

  if (params.error === "publish-locked") {
    return {
      id: "publish-locked",
      tone: "error",
      text: "Эту запись сейчас нельзя отправить на публикацию.",
    };
  }

  if (params.error === "withdraw-locked") {
    return {
      id: "withdraw-locked",
      tone: "error",
      text: "Эту запись сейчас нельзя отозвать с проверки.",
    };
  }

  if (params.error === "delete-locked") {
    return { id: "delete-locked", tone: "error", text: "Эту запись сейчас нельзя удалить." };
  }

  return null;
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export default async function AuthorMediaPage({ searchParams }: AuthorMediaPageProps) {
  const [author, params, mediaTypes] = await Promise.all([
    requireAuthor(),
    searchParams,
    getMediaTypeOptions(),
  ]);
  const items = await getAuthorMediaItems(author.id);
  const mediaTypesByItemsCount = sortMediaTypesByCount(
    mediaTypes,
    Array.from(
      items.reduce((counts, item) => {
        counts.set(item.mediaType, (counts.get(item.mediaType) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
      ([mediaType, count]) => ({ count, mediaType }),
    ),
  );
  const statusToast = getStatusToast(params);
  const mediaTypeFilter = parseAuthorMediaTypeFilter(params.type, mediaTypesByItemsCount);
  const statusFilter = parseAuthorMediaStatusFilter(params.status);
  const searchQuery = params.q?.trim() ?? "";
  const pageSize = parsePageSize(
    params.pageSize,
    AUTHOR_MEDIA_PAGE_SIZE_OPTIONS,
    DEFAULT_AUTHOR_MEDIA_PAGE_SIZE,
  );
  const visibleItems = filterAuthorMediaItems(items, {
    searchQuery,
    mediaType: mediaTypeFilter,
    status: statusFilter,
  });
  const totalPages = getTotalPages(visibleItems.length, pageSize);
  const page = clampPage(parsePage(params.page), totalPages);
  const paginatedItems = visibleItems.slice(getOffset(page, pageSize), getOffset(page, pageSize) + pageSize);
  const hasActiveFilters =
    Boolean(searchQuery) || mediaTypeFilter !== "all" || statusFilter !== "all";
  const paginationSearchParams = {
    pageSize: pageSize !== DEFAULT_AUTHOR_MEDIA_PAGE_SIZE ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: mediaTypeFilter !== "all" ? mediaTypeFilter : undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl leading-none text-stone-950">Мои предложения</h2>
          <p className="mt-2 text-sm text-stone-600">
            Здесь остаются черновики и записи на проверке. Опубликованное уходит в общий архив.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {items.length} всего
          </Badge>
          <Link
            href="/author/media/new"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus />
            Добавить
          </Link>
        </div>
      </div>

      {items.length > 0 ? (
        <AuthorMediaFiltersForm
          searchQuery={searchQuery}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypesByItemsCount}
          statusFilter={statusFilter}
        />
      ) : null}

      <AuthorToasts
        clearParams={[
          "created",
          "updated",
          "published",
          "submitted",
          "withdrawn",
          "deleted",
          "error",
        ]}
        messages={statusToast ? [statusToast] : []}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
          Пока нет черновиков или записей на проверке.
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
          {hasActiveFilters ? "По этим фильтрам записей нет." : "Записей нет."}
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-3">
          {paginatedItems.map((item) => {
            const isEditable = isAuthorEditablePublicationStatus(item.publicationStatus);
            const canRequestPublication = canAuthorRequestPublication(item.publicationStatus);
            const canWithdrawPublication =
              canAuthorWithdrawPublicationRequest(item.publicationStatus);
            const canDelete = canAuthorDeleteMediaItem(item.publicationStatus);
            const statusLabel = PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus];

            return (
              <div
                key={item.id}
                className="rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:bg-stone-50"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_BADGE_VARIANTS[item.publicationStatus]}>
                        {statusLabel}
                      </Badge>
                      <span className="text-xs text-stone-500">
                        Обновлено: {formatDate(item.updatedAt)}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-base font-semibold text-stone-950">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600">
                      {item.originalTitle ? (
                        <span className="min-w-0 truncate">{item.originalTitle}</span>
                      ) : null}
                      <span>{getMediaTypeLabel(item.mediaType, mediaTypes)}</span>
                      {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                    </div>
                    {item.adminNote ? (
                      <p className="mt-3 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">
                        {item.adminNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5 md:justify-end">
                    <Tooltip label="Смотреть">
                      <Link
                        href={`/author/media/${item.id}`}
                        className={buttonVariants({ variant: "outline", size: "icon" })}
                        aria-label={`Смотреть предложение ${item.title}`}
                      >
                        <Eye />
                      </Link>
                    </Tooltip>
                    {isEditable ? (
                      <Tooltip label="Править">
                        <Link
                          href={`/author/media/${item.id}/edit`}
                          className={buttonVariants({ variant: "outline", size: "icon" })}
                          aria-label={`Править предложение ${item.title}`}
                        >
                          <Edit3 />
                        </Link>
                      </Tooltip>
                    ) : null}
                    {canRequestPublication ? (
                      <Tooltip label="Отправить на публикацию">
                        <ConfirmAction
                          action={publishAuthorMediaItemAction}
                          confirmLabel="Отправить"
                          confirmVariant="positive"
                          description={getAuthorMediaPublicationConfirmDescription({
                            canPublishMediaWithoutReview: author.canPublishMediaWithoutReview,
                            title: item.title,
                          })}
                          fields={[{ name: "mediaItemId", value: item.id }]}
                          title="Отправить на публикацию?"
                          triggerAriaLabel={`Отправить на публикацию ${item.title}`}
                          triggerIcon={<Send />}
                          triggerLabel="Отправить"
                          triggerSize="icon"
                        />
                      </Tooltip>
                    ) : null}
                    {canWithdrawPublication ? (
                      <Tooltip label="Отозвать с проверки">
                        <form action={withdrawAuthorMediaItemAction}>
                          <input type="hidden" name="mediaItemId" value={item.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            aria-label={`Отозвать с проверки ${item.title}`}
                          >
                            <Undo2 />
                          </Button>
                        </form>
                      </Tooltip>
                    ) : null}
                    {canDelete ? (
                      <Tooltip label="Удалить">
                        <ConfirmAction
                          action={deleteAuthorMediaItemAction}
                          fields={[{ name: "mediaItemId", value: item.id }]}
                          title="Удалить черновик?"
                          description={`Запись «${item.title}» будет удалена из твоих предложений. Это действие нельзя отменить.`}
                          triggerIcon={<Trash2 />}
                          triggerLabel="Удалить"
                          triggerAriaLabel={`Удалить черновик ${item.title}`}
                          triggerSize="icon"
                          confirmLabel="Удалить"
                        />
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <PaginationNav
          basePath="/author/media"
          itemLabel="записей"
          page={page}
          pageSize={pageSize}
          pageSizeOptions={AUTHOR_MEDIA_PAGE_SIZE_OPTIONS}
          searchParams={paginationSearchParams}
          totalCount={visibleItems.length}
          totalPages={totalPages}
          variant="archive"
        />
        </>
      )}
    </div>
  );
}
