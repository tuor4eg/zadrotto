import Link from "next/link";
import { notFound } from "next/navigation";

import { formatRatingsCount, formatScore } from "@/app/media-items-catalog-logic";
import { getMediaItemByCode, getOtherMediaItemsFromFranchise } from "@/db/queries/media-items";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";

type MediaItemPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function MediaItemPage({ params }: MediaItemPageProps) {
  const { code } = await params;
  const item = await getMediaItemByCode(code);

  if (!item) {
    notFound();
  }

  const relatedItems = item.franchiseId
    ? await getOtherMediaItemsFromFranchise(item.franchiseId, item.id)
    : [];

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href="/"
          className="w-fit border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
        >
          Назад к картотеке
        </Link>

        <article className="border border-zinc-300 bg-white">
          <div className="grid gap-0 md:grid-cols-[320px_minmax(0,1fr)]">
            <div className="aspect-[4/3] bg-zinc-200 md:aspect-auto md:min-h-[480px]">
              {item.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.coverUrl}
                  alt={`Обложка: ${item.title}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#e4e4e7,#fafafa)] px-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  No cover
                </div>
              )}
            </div>

            <div className="flex min-h-[360px] flex-col justify-between gap-10 p-5 sm:p-8">
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                  <span>{MEDIA_TYPE_LABELS[item.mediaType]}</span>
                  {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                </div>
                {item.franchiseTitle && item.franchiseCode ? (
                  <Link
                    href={`/franchises/${item.franchiseCode}`}
                    className="w-fit border border-zinc-200 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Серия: <span className="font-medium text-zinc-800">{item.franchiseTitle}</span>
                  </Link>
                ) : null}

                <div className="flex flex-col gap-2">
                  <h1 className="text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl">
                    {item.title}
                  </h1>
                  {item.originalTitle && item.originalTitle !== item.title ? (
                    <p className="text-lg text-zinc-500">{item.originalTitle}</p>
                  ) : null}
                  {item.description ? (
                    <p className="max-w-2xl text-base leading-7 text-zinc-600">
                      {item.description}
                    </p>
                  ) : null}
                </div>

                <div className="w-fit border border-zinc-300 px-3 py-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Средний рейтинг
                  </span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums text-zinc-950">
                    {formatScore(item.averageScore)}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {formatRatingsCount(item.ratingsCount)}
                  </span>
                </div>
              </div>

              <div className="border-t border-zinc-200 pt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">
                <div>{item.code}</div>
                {relatedItems.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-2 normal-case tracking-normal">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                      Еще из этой серии
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {relatedItems.map((relatedItem) => (
                        <Link
                          key={relatedItem.id}
                          href={`/media/${relatedItem.code}`}
                          className="border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                        >
                          {relatedItem.title}
                          {relatedItem.releaseYear ? `, ${relatedItem.releaseYear}` : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
