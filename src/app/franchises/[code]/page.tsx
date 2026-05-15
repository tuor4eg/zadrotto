import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveNote } from "@/app/archive-note";
import { getFranchiseByCode, getMediaItemsByFranchiseId } from "@/db/queries/franchises";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";

type FranchisePageProps = {
  params: Promise<{
    code: string;
  }>;
};

function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

export default async function FranchisePage({ params }: FranchisePageProps) {
  const { code } = await params;
  const franchise = await getFranchiseByCode(code);

  if (!franchise) {
    notFound();
  }

  const items = await getMediaItemsByFranchiseId(franchise.id);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <Link
          href="/"
          className="w-fit rounded-md border border-stone-400 bg-stone-50/70 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-stone-800 transition-colors hover:border-stone-950 hover:bg-stone-100"
        >
          Назад к картотеке
        </Link>

        <section className="archive-paper archive-panel archive-stack archive-stack-left min-w-0">
          <div className="border-b border-stone-300/80 p-6 sm:p-8">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-800">
              Серия
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <h1 className="font-serif text-5xl leading-none text-stone-950 sm:text-6xl">
                {franchise.title}
              </h1>
              {franchise.originalTitle && franchise.originalTitle !== franchise.title ? (
                <p className="font-mono text-sm uppercase tracking-[0.16em] text-stone-600">
                  {franchise.originalTitle}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-dashed border-stone-300 pt-5 font-mono text-sm text-stone-800">
              <span>{formatMediaItemsCount(items.length)}</span>
              <span>•</span>
              <span>архивная подборка</span>
            </div>
          </div>

          {franchise.description ? (
            <div className="border-b border-stone-300/80 p-6 sm:p-8">
              <ArchiveNote text={franchise.description} />
            </div>
          ) : null}

          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Записи архива
              </h2>
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="mt-4 rounded-md border border-stone-300/80 bg-stone-50/45 p-5 text-sm text-stone-600">
                В этой серии пока нет записей.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/media/${item.code}`}
                    className="group min-w-0 rounded-md border border-stone-300/80 bg-stone-50/50 p-2 transition-colors hover:border-stone-950 hover:bg-stone-100/70"
                  >
                    <span className="block aspect-square overflow-hidden rounded-sm border border-stone-300/70 bg-stone-200/50">
                      {item.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.coverUrl}
                          alt={`Обложка: ${item.title}`}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#d8cbb4,#f7efdf_52%,#c8b58f)] px-3 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                          Без обложки
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-950">
                        {item.title}
                      </span>
                      {item.originalTitle && item.originalTitle !== item.title ? (
                        <span className="mt-1 block truncate font-mono text-xs uppercase tracking-[0.1em] text-stone-500">
                          {item.originalTitle}
                        </span>
                      ) : null}
                      <span className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-stone-500">
                        {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                        {item.releaseYear ? <span>•</span> : null}
                        <span>{MEDIA_TYPE_LABELS[item.mediaType].toLowerCase()}</span>
                        <span>•</span>
                        <span>{formatScore(item.averageScore)}</span>
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-stone-500">
                        {formatRatingsCount(item.ratingsCount)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
