import Link from "next/link";
import { connection } from "next/server";
import { Search, Shield, UserCircle } from "lucide-react";

import { getCatalogMediaItems, getCatalogMediaTypeCounts } from "@/db/queries/media-items";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { getCurrentAuthor } from "@/lib/author-auth";
import { parsePage } from "@/lib/pagination";
import {
  parseAuthorRatingFilter,
  parseCatalogSort,
  parseMediaTypeFilter,
} from "./media-items-catalog-logic";
import { MediaItemsCatalog } from "./media-items-catalog";

const CATALOG_PAGE_SIZE = 50;

type HomeProps = {
  searchParams: Promise<{
    mine?: string;
    page?: string;
    q?: string;
    sort?: string;
    type?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  await connection();

  const [currentAuthor, currentAdminUser, params] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
    searchParams,
  ]);
  const searchQuery = params.q?.trim() ?? "";
  const mediaTypeFilter = parseMediaTypeFilter(params.type ?? null);
  const sort = parseCatalogSort(params.sort ?? null);
  const authorRatingFilter = currentAuthor
    ? parseAuthorRatingFilter(params.mine ?? null)
    : "all";
  const [catalog, mediaTypeCounts] = await Promise.all([
    getCatalogMediaItems({
      authorRatingFilter,
      currentAuthorId: currentAuthor?.id,
      mediaTypeFilter,
      page: parsePage(params.page),
      pageSize: CATALOG_PAGE_SIZE,
      searchQuery,
      sort,
    }),
    getCatalogMediaTypeCounts(),
  ]);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <header className="archive-paper archive-panel archive-stack archive-stack-bottom flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center border border-stone-400/70 bg-stone-100/60 text-center font-mono text-sm font-semibold leading-5 text-stone-950 shadow-[inset_0_0_0_1px_rgba(68,64,60,0.16)]">
              Ж. К.
              <br />
              Н. Б.
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-3xl leading-none text-stone-950 sm:text-5xl">
                Журнал, которого не было
              </h1>
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-700">
                База хранит факты. Журнал достает из них память.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
            <a
              href="#catalog-search"
              className="grid size-10 place-items-center border border-transparent text-stone-800 transition-colors hover:border-stone-300 hover:bg-stone-100/60"
              aria-label="Перейти к поиску"
            >
              <Search className="size-5" />
            </a>
            {currentAdminUser ? (
              <Link
                href="/admin"
                className="inline-flex h-10 items-center gap-2 border-l border-stone-400/70 px-3 font-mono text-xs uppercase tracking-[0.12em] text-stone-800 transition-colors hover:bg-stone-100/70"
              >
                <Shield className="size-4" />
                Админка
              </Link>
            ) : null}
            <Link
              href={currentAuthor ? "/author" : "/author/login"}
              className="inline-flex h-10 items-center gap-2 border-l border-stone-400/70 px-3 font-mono text-xs uppercase tracking-[0.12em] text-stone-800 transition-colors hover:bg-stone-100/70"
            >
              <UserCircle className="size-5" />
              {currentAuthor ? "Профиль" : "Войти"}
            </Link>
          </div>
        </header>

        <MediaItemsCatalog
          key={`${searchQuery}:${mediaTypeFilter}:${sort}:${authorRatingFilter}:${catalog.page}`}
          authorRatingFilter={authorRatingFilter}
          currentAuthor={
            currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
          }
          items={catalog.items}
          mediaTypeCounts={mediaTypeCounts}
          mediaTypeFilter={mediaTypeFilter}
          page={catalog.page}
          pageSize={catalog.pageSize}
          searchQuery={searchQuery}
          sort={sort}
          totalCount={catalog.totalCount}
          totalPages={catalog.totalPages}
        />
      </div>
    </main>
  );
}
