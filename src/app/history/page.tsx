import Link from "next/link";
import { after } from "next/server";

import { MediaItemTile } from "@/app/media-item-tile";
import { PaginationNav } from "@/components/pagination-nav";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getRecentlyViewedMediaItems } from "@/db/queries/main-page";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { requireAuthor } from "@/lib/auth/author-auth";
import {
  clampPage,
  getOffset,
  getTotalPages,
  parsePage,
  parsePageSize,
} from "@/lib/common/pagination";
import {
  getRecentlyViewedEntries,
  removeRecentlyViewedIds,
} from "@/lib/main-page/recently-viewed";
import { ViewedAt } from "./viewed-at";

const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
const DEFAULT_PAGE_SIZE = 48;

type HistoryPageProps = {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const [author, params, settings] = await Promise.all([
    requireAuthor(),
    searchParams,
    getArchiveSettings(),
  ]);
  const result = await getRecentlyViewedEntries(
    author.id,
    settings.recentlyViewedHistoryLimit,
  );
  const effectiveMediaTypes = await getEffectiveMediaTypeOptions(author.id);
  const accessibleMediaTypeCodes = effectiveMediaTypes.map(({ code }) => code);
  const enabledMediaTypeCodes = new Set(
    effectiveMediaTypes.filter(({ isEnabled }) => isEnabled).map(({ code }) => code),
  );
  const ids = result.entries.map(({ mediaItemId }) => mediaItemId);
  const storedItems = result.ok
    ? await getRecentlyViewedMediaItems({
        accessibleMediaTypeCodes,
        authorId: author.id,
        ids,
      })
    : [];
  const validIds = new Set(storedItems.map(({ id }) => id));
  const invalidIds = ids.filter((id) => !validIds.has(id));

  if (result.ok && invalidIds.length > 0) {
    after(() => removeRecentlyViewedIds(author.id, invalidIds));
  }

  const viewedAtById = new Map(
    result.entries.map(({ mediaItemId, viewedAt }) => [mediaItemId, viewedAt]),
  );
  const visibleItems = storedItems.filter(({ mediaType }) => enabledMediaTypeCodes.has(mediaType));
  const pageSize = parsePageSize(params.pageSize, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE);
  const totalPages = getTotalPages(visibleItems.length, pageSize);
  const page = clampPage(parsePage(params.page), totalPages);
  const pageItems = visibleItems.slice(getOffset(page, pageSize), getOffset(page, pageSize) + pageSize);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto w-full max-w-[1480px]">
        <section className="archive-paper archive-panel relative p-4 sm:p-6">
          <header className="border-b border-stone-400/25 pb-4">
            <nav aria-label="Хлебные крошки" className="mb-3 font-mono text-xs text-stone-600">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href="/">
                    Главная
                  </Link>
                </li>
                <li aria-hidden="true" className="text-stone-400">/</li>
                <li aria-current="page" className="text-stone-800">История просмотров</li>
              </ol>
            </nav>
            <h1 className="font-serif text-3xl sm:text-4xl">История просмотров</h1>
            <p className="mt-2 text-sm text-stone-600">Недавно открытые записи архива.</p>
          </header>

          {!result.ok ? (
            <div className="archive-paper mt-5 rounded-md border border-red-900/25 p-6 text-center text-red-950">
              История просмотров временно недоступна. Попробуйте открыть страницу позже.
            </div>
          ) : result.entries.length === 0 || storedItems.length === 0 ? (
            <div className="mt-5 py-12 text-center">
              <p className="font-serif text-2xl">История пока пуста</p>
              <p className="mt-2 text-sm text-stone-600">Откройте запись, и она появится здесь.</p>
              <Link href="/" className="archive-control-surface mt-5 inline-flex h-10 items-center rounded-md border border-stone-300/80 px-4 font-mono text-xs uppercase tracking-wider">Перейти в каталог</Link>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="mt-5 py-12 text-center">
              <p className="font-serif text-2xl">Все просмотренные типы сейчас скрыты</p>
              <p className="mt-2 text-sm text-stone-600">Включите нужные типы медиа в настройках профиля.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-[repeat(auto-fill,72px)] justify-start gap-3">
                {pageItems.map((item) => {
                  const viewedAt = viewedAtById.get(item.id);
                  return (
                    <article key={item.id} className="min-w-0">
                      <MediaItemTile currentAuthorScore={item.currentAuthorScore} href={`/media/${item.code}`} item={item} />
                      {viewedAt ? <p className="mt-2 truncate text-center font-mono text-[10px] text-stone-500"><ViewedAt value={viewedAt.toISOString()} /></p> : null}
                    </article>
                  );
                })}
              </div>
              <div className="mt-5">
                <PaginationNav basePath="/history" itemLabel="записей" page={page} pageSize={pageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} searchParams={{ pageSize: params.pageSize }} totalCount={visibleItems.length} totalPages={totalPages} variant="archive" />
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
