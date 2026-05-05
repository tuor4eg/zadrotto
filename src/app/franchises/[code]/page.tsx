import Link from "next/link";
import { notFound } from "next/navigation";

import { formatRatingsCount, formatScore } from "@/app/media-items-catalog-logic";
import { getFranchiseByCode, getMediaItemsByFranchiseId } from "@/db/queries/franchises";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";

type FranchisePageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function FranchisePage({ params }: FranchisePageProps) {
  const { code } = await params;
  const franchise = await getFranchiseByCode(code);

  if (!franchise) {
    notFound();
  }

  const items = await getMediaItemsByFranchiseId(franchise.id);

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href="/"
          className="w-fit border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
        >
          Назад к картотеке
        </Link>

        <header className="border border-zinc-300 bg-white p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
            Франшиза
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <h1 className="text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl">
              {franchise.title}
            </h1>
            {franchise.originalTitle && franchise.originalTitle !== franchise.title ? (
              <p className="text-lg text-zinc-500">{franchise.originalTitle}</p>
            ) : null}
            {franchise.description ? (
              <p className="max-w-2xl text-base leading-7 text-zinc-600">
                {franchise.description}
              </p>
            ) : null}
          </div>
        </header>

        <section className="border border-zinc-300 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Тайтлы
            </h2>
          </div>

          {items.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500">В этой франшизе пока нет тайтлов.</div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/media/${item.code}`}
                  className="grid gap-3 px-4 py-4 transition-colors hover:bg-zinc-100 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-zinc-950">{item.title}</span>
                    {item.originalTitle && item.originalTitle !== item.title ? (
                      <span className="mt-1 block text-sm text-zinc-500">
                        {item.originalTitle}
                      </span>
                    ) : null}
                    {item.description ? (
                      <span className="mt-2 block max-w-2xl text-sm leading-6 text-zinc-600">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-2 text-xs font-medium text-zinc-500 sm:justify-end">
                    {item.releaseYear ? (
                      <span className="border border-zinc-200 px-2 py-1 tabular-nums">
                        {item.releaseYear}
                      </span>
                    ) : null}
                    <span className="border border-zinc-200 px-2 py-1">
                      {MEDIA_TYPE_LABELS[item.mediaType]}
                    </span>
                    <span className="border border-zinc-200 px-2 py-1 tabular-nums">
                      {formatScore(item.averageScore)}
                    </span>
                    <span className="border border-zinc-200 px-2 py-1">
                      {formatRatingsCount(item.ratingsCount)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
