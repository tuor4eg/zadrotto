import Link from "next/link";

import { getAuthorMediaItems } from "@/db/queries/media-items";
import {
  filterAuthorMediaItems,
  parseAuthorMediaStatusFilter,
  parseAuthorMediaTypeFilter,
} from "@/lib/author-media-filters";
import { isAuthorEditablePublicationStatus } from "@/lib/author-media-form";
import { canAuthorRequestPublication } from "@/lib/author-media-publication";
import { requireAuthor } from "@/lib/author-auth";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import {
  PUBLICATION_STATUS_VALUE_LABELS,
  PUBLISHED_PUBLICATION_STATUS,
  type PublicationStatus,
} from "@/lib/publication-status";
import { resolveCoverUrl } from "@/lib/storage";
import { publishAuthorMediaItemAction } from "./actions";
import { AuthorMediaFiltersForm } from "./author-media-filters-form";
import { CoverPreview } from "./cover-preview";

type AuthorMediaPageProps = {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
    published?: string;
    submitted?: string;
    status?: string;
    type?: string;
    q?: string;
  }>;
};

const STATUS_ICON_CLASS_NAMES: Record<PublicationStatus, string> = {
  private: "border-zinc-300 bg-zinc-100 text-zinc-600",
  submitted: "border-amber-300 bg-amber-50 text-amber-700",
  published: "border-emerald-300 bg-emerald-50 text-emerald-700",
  rejected: "border-red-300 bg-red-50 text-red-700",
};

function getStatusMessage(params: Awaited<AuthorMediaPageProps["searchParams"]>) {
  if (params.created === "1") {
    return { tone: "success" as const, text: "Запись создана." };
  }

  if (params.updated === "1") {
    return { tone: "success" as const, text: "Запись сохранена." };
  }

  if (params.published === "1") {
    return { tone: "success" as const, text: "Запись опубликована." };
  }

  if (params.submitted === "1") {
    return { tone: "success" as const, text: "Запись отправлена на проверку." };
  }

  if (params.error === "locked") {
    return { tone: "error" as const, text: "Эту запись сейчас нельзя редактировать." };
  }

  if (params.error === "publish-locked") {
    return { tone: "error" as const, text: "Эту запись сейчас нельзя отправить на публикацию." };
  }

  return null;
}

function PublicationStatusIcon({ status }: { status: PublicationStatus }) {
  if (status === "private") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none">
        <path
          d="M7 10V8a5 5 0 0 1 10 0v2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M6 10h12v9H6z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (status === "submitted") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 8v5l3 2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (status === "published") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none">
        <path
          d="M5 12l4 4L19 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none">
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default async function AuthorMediaPage({ searchParams }: AuthorMediaPageProps) {
  const [author, params] = await Promise.all([requireAuthor(), searchParams]);
  const items = await getAuthorMediaItems(author.id);
  const statusMessage = getStatusMessage(params);
  const mediaTypeFilter = parseAuthorMediaTypeFilter(params.type);
  const statusFilter = parseAuthorMediaStatusFilter(params.status);
  const searchQuery = params.q?.trim() ?? "";
  const visibleItems = filterAuthorMediaItems(items, {
    searchQuery,
    mediaType: mediaTypeFilter,
    status: statusFilter,
  });
  const hasActiveFilters =
    Boolean(searchQuery) || mediaTypeFilter !== "all" || statusFilter !== "all";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-950">Моя картотека</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Приватные записи видны только тебе и не открываются публичным маршрутом.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">
            {items.length} всего
          </span>
          <Link
            href="/author/media/new"
            className="border border-zinc-950 bg-zinc-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white hover:text-zinc-950"
          >
            Добавить
          </Link>
        </div>
      </div>

      {items.length > 0 ? (
        <AuthorMediaFiltersForm
          searchQuery={searchQuery}
          mediaTypeFilter={mediaTypeFilter}
          statusFilter={statusFilter}
        />
      ) : null}

      {statusMessage ? (
        <div
          className={`border px-3 py-2 text-sm ${
            statusMessage.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {statusMessage.text}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="border border-zinc-200 p-5 text-sm text-zinc-500">
          Пока нет приватно добавленных записей.
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="border border-zinc-200 p-5 text-sm text-zinc-500">
          {hasActiveFilters ? "По этим фильтрам записей нет." : "Записей нет."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => {
            const isPublished = item.publicationStatus === PUBLISHED_PUBLICATION_STATUS;
            const isEditable = isAuthorEditablePublicationStatus(item.publicationStatus);
            const canRequestPublication = canAuthorRequestPublication(item.publicationStatus);
            const coverUrl = resolveCoverUrl(item.coverUrl);
            const statusLabel = PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus];
            const viewHref = isPublished ? `/media/${item.code}` : `/author/media/${item.id}`;

            return (
              <article key={item.id} className="flex min-h-full flex-col border border-zinc-200">
                <div className="aspect-square bg-zinc-100">
                  {coverUrl ? (
                    <CoverPreview
                      src={coverUrl}
                      alt={`Обложка: ${item.title}`}
                      buttonClassName="block h-full w-full bg-white p-0 text-left"
                      thumbnailClassName="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      Без обложки
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-zinc-950">
                        {item.title}
                      </h3>
                      {item.originalTitle ? (
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {item.originalTitle}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center border ${STATUS_ICON_CLASS_NAMES[item.publicationStatus]}`}
                      title={statusLabel}
                      aria-label={`Статус: ${statusLabel}`}
                    >
                      <PublicationStatusIcon status={item.publicationStatus} />
                    </span>
                  </div>

                  <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <div>
                      <dt className="sr-only">Тип медиа</dt>
                      <dd>{MEDIA_TYPE_LABELS[item.mediaType]}</dd>
                    </div>
                    {item.releaseYear ? (
                      <div>
                        <dt className="sr-only">Год выпуска</dt>
                        <dd>{item.releaseYear}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="sr-only">Статус публикации</dt>
                      <dd>{statusLabel}</dd>
                    </div>
                  </dl>

                  {item.adminNote ? (
                    <div className="line-clamp-3 border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs leading-5 text-zinc-600">
                      {item.adminNote}
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Link
                      href={viewHref}
                      className="border border-zinc-300 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                    >
                      Смотреть
                    </Link>
                    {isEditable ? (
                      <Link
                        href={`/author/media/${item.id}/edit`}
                        className="border border-zinc-300 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                      >
                        Править
                      </Link>
                    ) : null}
                    {canRequestPublication ? (
                      <form action={publishAuthorMediaItemAction}>
                        <input type="hidden" name="mediaItemId" value={item.id} />
                        <button
                          type="submit"
                          className="border border-zinc-950 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white hover:text-zinc-950"
                        >
                          Опубликовать
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
