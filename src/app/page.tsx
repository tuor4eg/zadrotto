import Link from "next/link";
import { connection } from "next/server";

import { getArchiveStats, getCatalogMediaItems } from "@/db/queries/media-items";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { getCurrentAuthor } from "@/lib/author-auth";
import { ArchiveStats } from "./archive-stats";
import { MediaItemsCatalog } from "./media-items-catalog";

export default async function Home() {
  await connection();

  const [currentAuthor, currentAdminUser] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const [items, stats] = await Promise.all([
    getCatalogMediaItems(currentAuthor?.id),
    getArchiveStats(),
  ]);

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-300 pb-5">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
              Архив
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold text-zinc-950 sm:text-4xl">
              Журнал, которого не было
            </h1>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {currentAdminUser ? (
              <Link
                href="/admin"
                className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
              >
                Админка
              </Link>
            ) : null}
            <Link
              href={currentAuthor ? "/author" : "/author/login"}
              className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
            >
              {currentAuthor ? "Профиль" : "Войти"}
            </Link>
          </div>
        </header>

        <ArchiveStats stats={stats} />

        <MediaItemsCatalog
          items={items}
          currentAuthor={
            currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
          }
        />
      </div>
    </main>
  );
}
