import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { ArchiveNote } from "@/app/archive-note";
import { MediaItemTile } from "@/app/media-item-tile";
import { ArchiveBackLink } from "@/components/ui/archive-back-link";
import { getFranchiseByCode, getMediaItemsByFranchiseId } from "@/db/queries/franchises";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types";

type FranchisePageProps = {
  params: Promise<{
    code: string;
  }>;
};

type FranchiseMediaItem = Awaited<ReturnType<typeof getMediaItemsByFranchiseId>>[number];

type FranchiseMediaSection = {
  count: number;
  id: string;
  items: FranchiseMediaItem[];
  label: string;
  mediaType: MediaType;
};

function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

function getFranchiseMediaSections(
  items: FranchiseMediaItem[],
  mediaTypes: MediaTypeOption[],
): FranchiseMediaSection[] {
  const itemsByMediaType = new Map<MediaType, FranchiseMediaItem[]>();

  for (const item of items) {
    itemsByMediaType.set(item.mediaType, [...(itemsByMediaType.get(item.mediaType) ?? []), item]);
  }

  return mediaTypes
    .map((mediaType) => {
      const sectionItems = itemsByMediaType.get(mediaType.code) ?? [];

      return {
        count: sectionItems.length,
        id: `section-${mediaType.code}`,
        items: sectionItems,
        label: getMediaTypeLabel(mediaType.code, mediaTypes),
        mediaType: mediaType.code,
      };
    })
    .filter((section) => section.count > 0);
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
  const sections = getFranchiseMediaSections(items, mediaTypes);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <section className="archive-paper archive-panel archive-stack archive-stack-left relative z-10 min-w-0 overflow-visible">
          <ArchiveBackLink
            className="sm:top-10"
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
            <ArchiveNote text={franchise.description} maxWidthClassName="max-w-none" />
          </div>

          {items.length === 0 ? (
            <div className="px-6 pb-6 pt-3 sm:px-8 sm:pb-8 sm:pt-4">
              <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-5 text-sm text-stone-600">
                В этой серии пока нет записей.
              </div>
            </div>
          ) : null}
          {sections.length > 0 ? (
            <div className="relative z-20 px-6 pb-7 pt-3 sm:px-8 sm:pb-8">
              <div className="flex flex-col gap-3">
                {sections.map((section) => (
                  <details
                    key={section.mediaType}
                    id={section.id}
                    className="group/section scroll-mt-5 rounded-sm border border-stone-300/70 bg-stone-50/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                    open
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 transition-colors hover:bg-stone-100/45 [&::-webkit-details-marker]:hidden">
                      <h2 className="min-w-0 truncate font-mono text-xs font-semibold uppercase tracking-[0.12em] text-stone-800">
                        {section.label}
                      </h2>
                      <span className="font-mono text-[11px] tabular-nums text-stone-500">
                        {section.count}
                      </span>
                      <span className="h-px min-w-6 flex-1 bg-stone-300/80" />
                      <ChevronDown className="size-4 shrink-0 text-stone-500 transition-transform group-open/section:rotate-180" />
                    </summary>

                    <div className="grid grid-cols-3 content-start gap-2.5 border-t border-stone-300/70 p-3 md:grid-cols-4 xl:grid-cols-6">
                      {section.items.map((item) => (
                        <MediaItemTile
                          key={item.id}
                          currentAuthorScore={currentAuthor ? item.currentAuthorScore : undefined}
                          item={item}
                          href={`/media/${item.code}`}
                          mediaTypes={mediaTypes}
                          showMediaTypeLabel={sections.length > 1}
                        />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
