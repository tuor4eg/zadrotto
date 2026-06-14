import { notFound } from "next/navigation";

import { ArchiveNote } from "@/app/archive-note";
import { MediaItemTile } from "@/app/media-item-tile";
import { ArchiveBackLink } from "@/components/ui/archive-back-link";
import { getFranchiseByCode, getMediaItemsByFranchiseId } from "@/db/queries/franchises";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

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

  const [currentAuthor, mediaTypes] = await Promise.all([
    getCurrentAuthor(),
    getMediaTypeOptions(),
  ]);
  const items = await getMediaItemsByFranchiseId(franchise.id, currentAuthor?.id);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <section className="archive-paper archive-panel archive-stack archive-stack-left relative z-10 min-w-0 overflow-visible">
          <ArchiveBackLink
            className="top-10"
            href="/"
            label="Назад к картотеке"
            tooltipLabel="К картотеке"
          />

          <div className="archive-franchise-sticker">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-800">
              Серия
            </p>
            <div className="mt-3 flex flex-col gap-x-6 gap-y-3 lg:flex-row lg:items-baseline">
              <div className="min-w-0">
                <h1 className="break-words font-serif text-5xl leading-none text-stone-950 sm:text-6xl">
                  {franchise.title}
                </h1>
              </div>
              <p className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-stone-500 lg:text-right">
                {formatMediaItemsCount(items.length)}
              </p>
            </div>
          </div>

          <div className="px-6 pb-6 pt-3 sm:px-8 sm:pb-8">
            <div className="mt-3 flex flex-col gap-3">
              {franchise.originalTitle && franchise.originalTitle !== franchise.title ? (
                <p className="font-mono text-sm uppercase tracking-[0.16em] text-stone-600">
                  {franchise.originalTitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <ArchiveNote text={franchise.description} />
          </div>

          <div className="px-6 pb-6 pt-3 sm:px-8 sm:pb-8 sm:pt-4">
            {items.length === 0 ? (
              <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-5 text-sm text-stone-600">
                В этой серии пока нет записей.
              </div>
            ) : (
              <div className="grid grid-cols-3 content-start gap-2.5 md:grid-cols-4 xl:grid-cols-6">
                {items.map((item) => (
                  <MediaItemTile
                    key={item.id}
                    currentAuthorScore={
                      currentAuthor ? item.currentAuthorScore : undefined
                    }
                    item={item}
                    href={`/media/${item.code}`}
                    mediaTypes={mediaTypes}
                    showMediaTypeLabel
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
