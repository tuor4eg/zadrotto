import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  Archive,
  BookOpen,
  Bookmark,
  Clapperboard,
  Clock3,
  FileText,
  Gamepad2,
  Info,
  Loader2,
  PanelsTopLeft,
  Shapes,
  Shuffle,
  Sparkles,
  Star,
  Tv,
  type LucideIcon,
} from "lucide-react";

import { ArchiveCover } from "@/app/media-item-tile";
import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import {
  createMainPageDataPromises,
  type MainPageMediaItem,
} from "@/db/queries/main-page";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getRandomPublishedFranchisePreview } from "@/db/queries/franchises";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getDailyDossier } from "@/lib/main-page/daily-dossier";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
import {
  AVERAGE_RATING_TEXT_TONE_CLASS_NAMES,
  getRatingTone,
} from "@/lib/ratings/tone";
import { ResponsiveTileGrid } from "./main/responsive-tile-grid";
import { MainLoginButton } from "./main/main-login-button";

const MEDIA_TYPE_ICONS: Record<string, LucideIcon> = {
  anime: Sparkles,
  book: BookOpen,
  comic: PanelsTopLeft,
  film: Clapperboard,
  game: Gamepad2,
  other: Shapes,
  series: Tv,
};

type SectionProps = {
  children: React.ReactNode;
  className?: string;
  href: string;
  icon: React.ReactNode;
  title: React.ReactNode;
};

function Section({ children, className, href, icon, title }: SectionProps) {
  return (
    <section className={`archive-paper archive-panel min-w-0 p-4 sm:px-5 sm:pt-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
          <span className="shrink-0 text-red-950/70">{icon}</span>
          {title}
        </h2>
        <Link href={href} className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">
          Смотреть всё →
        </Link>
      </div>
      {children}
    </section>
  );
}

function FiveStarRating({ className, score }: { className: string; score: number | null }) {
  const starRating = (score ?? 0) / 20;

  return (
    <div
      aria-label={`Средняя оценка: ${formatScore(score)} из 10`}
      className={`flex w-fit flex-col items-center ${className}`}
      role="img"
    >
      <span className="font-mono text-lg font-semibold leading-none tabular-nums">
        {formatScore(score)}
      </span>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => {
          const fillPercent = Math.max(0, Math.min(100, (starRating - index) * 100));

          return (
            <span key={index} className="relative size-4">
              <Star className="absolute inset-0 size-4 opacity-25" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
                <Star className="size-4 fill-current" />
              </span>
            </span>
          );
        })}
      </span>
    </div>
  );
}

function MainSectionLoader({ minHeight = "min-h-40" }: { minHeight?: string }) {
  return <div className={`grid place-items-center ${minHeight}`} role="status" aria-label="Загрузка"><Loader2 className="size-6 animate-spin text-red-950/65" /></div>;
}

async function SectionItems({ promise }: { promise: Promise<MainPageMediaItem[]> }) {
  const items = await promise;
  return <ResponsiveTileGrid items={items} variant="top" />;
}

async function DossierContent({
  enabledMediaTypeCodes,
  mediaTypes,
  promise,
}: {
  enabledMediaTypeCodes: string[];
  mediaTypes: Array<{ code: string; name: string }>;
  promise: Promise<MainPageMediaItem | null>;
}) {
  const globalItem = await promise;
  const item = globalItem && enabledMediaTypeCodes.includes(globalItem.mediaType) ? globalItem : null;
  if (!item) return <p className="py-8 text-center font-mono text-sm text-stone-500">Досье появится вместе с первой записью.</p>;
  const ratingClassName = AVERAGE_RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(item.averageScore)];
  return <div className="grid items-stretch grid-cols-[minmax(0,7rem)_1fr] gap-4 xl:[grid-template-columns:calc((min(1480px,calc(100vw_-_3.5rem))_-_444px)/7)_minmax(0,1fr)]"><Link href={`/media/${item.code}`} className="block aspect-[2/3] overflow-hidden rounded-md border border-stone-300/80 bg-stone-100"><ArchiveCover carrierFrame={false} item={{ ...item, coverUrl: item.coverThumbUrl ?? item.coverUrl }} className="h-full w-full" /></Link><div className="flex min-h-0 min-w-0 flex-col overflow-hidden [contain:size]"><h3 className="line-clamp-2 font-serif text-xl" title={item.title}>{item.title}</h3><p className="mt-1 truncate font-mono text-xs uppercase tracking-wider text-stone-600">{mediaTypes.find((type) => type.code === item.mediaType)?.name ?? item.mediaType}{item.releaseYear ? ` · ${item.releaseYear}` : ""}</p><div className="mt-3 shrink-0"><FiveStarRating className={ratingClassName} score={item.averageScore} /><p className="mt-2 font-mono text-xs text-stone-600">{formatRatingsCount(item.ratingsCount)}</p></div><Link href={`/media/${item.code}`} className="archive-control-surface mt-auto flex h-10 shrink-0 items-center justify-center rounded-md border border-stone-300/80 px-3 text-center font-mono text-xs uppercase tracking-wider">Открыть</Link></div></div>;
}

async function RandomDossierLink({ promise }: { promise: Promise<MainPageMediaItem | null> }) {
  const item = await promise;
  return <Link href={item ? `/media/${item.code}` : "/archive"} className="archive-control-surface inline-flex h-10 items-center justify-center rounded-md border border-stone-300/80 px-4 font-mono text-xs uppercase tracking-wider hover:border-stone-700"><Shuffle className="mr-2 size-4" />Случайное досье</Link>;
}

async function AboutArchive({ promise }: { promise: ReturnType<typeof createMainPageDataPromises>["about"] }) {
  const { counts, totalCount } = await promise;
  return <div className="divide-y divide-dashed divide-stone-400/35"><Link href="/archive" className="group flex items-center justify-between py-2"><span className="font-mono text-xs uppercase tracking-wider text-stone-600 group-hover:text-stone-950">Всего записей</span><strong className="font-serif text-2xl">{totalCount.toLocaleString("ru-RU")}</strong></Link>{counts.map((item) => { const MediaTypeIcon = MEDIA_TYPE_ICONS[item.mediaType] ?? Archive; return <Link key={item.mediaType} href={`/archive?type=${encodeURIComponent(item.mediaType)}`} className="group flex items-center justify-between gap-4 py-2"><span className="flex items-center gap-2 font-serif text-lg"><MediaTypeIcon aria-hidden="true" className="size-4 text-red-950/65 transition-colors group-hover:text-red-950" />{item.mediaTypeName}</span><span className="font-mono text-sm tabular-nums text-stone-600 group-hover:text-stone-950">{item.count.toLocaleString("ru-RU")}</span></Link>; })}</div>;
}

async function RandomFranchiseSection({
  promise,
}: {
  promise: ReturnType<typeof getRandomPublishedFranchisePreview>;
}) {
  const preview = await promise;

  return (
    <Section
      href="/series"
      icon={<Shuffle className="size-5" />}
      title={preview ? (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">Случайная серия</span>
          <Link
            href={`/series/${preview.franchise.code}`}
            className="truncate text-red-950/75 underline decoration-stone-400/60 underline-offset-4 hover:text-red-950"
          >
            {preview.franchise.title}
          </Link>
        </span>
      ) : "Случайная серия"}
    >
      {preview ? (
        <ResponsiveTileGrid items={preview.items} variant="top" />
      ) : (
        <p className="py-8 text-center font-mono text-sm text-stone-500">
          Серия появится, когда в архиве будет хотя бы пять связанных записей.
        </p>
      )}
    </Section>
  );
}

export default async function MainPage() {
  await connection();

  const [currentAuthor, currentAdmin] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const [effectiveMediaTypes, archiveSettings] = await Promise.all([
    getEffectiveMediaTypeOptions(currentAuthor?.id),
    getArchiveSettings(),
  ]);
  const mediaTypes = effectiveMediaTypes.filter((item) => item.isEnabled);
  const enabledMediaTypeCodes = mediaTypes.map((item) => item.code);
  const data = createMainPageDataPromises({
    currentAuthorId: currentAuthor?.id,
    enabledMediaTypeCodes,
    topArchiveMinAverageScore: archiveSettings.topArchiveMinAverageScore,
    topArchiveMinRatingsCount: archiveSettings.topArchiveMinRatingsCount,
  });
  const dossierPromise = getDailyDossier(currentAuthor?.id);
  const randomFranchisePromise = getRandomPublishedFranchisePreview({
    currentAuthorId: currentAuthor?.id,
    enabledMediaTypeCodes,
  });
  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <ArchiveSiteHeader
          brandHref="/"
          currentAdminUser={Boolean(currentAdmin)}
          currentAuthor={Boolean(currentAuthor)}
          variant="main"
        />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[auto_auto_auto]">
          <div className="flex min-w-0 flex-col gap-3 xl:contents">
            <Section className="xl:col-start-1 xl:row-start-1" href="/archive?sort=average_score" icon={<Star className="size-5" />} title="Топ архива"><Suspense fallback={<MainSectionLoader minHeight="min-h-52" />}><SectionItems promise={data.top} /></Suspense></Section>
            <div className="grid gap-3 lg:grid-cols-2 xl:col-start-1 xl:row-start-2">
              <Section href="/archive?sort=created_at" icon={<Clock3 className="size-5" />} title="Новое в базе"><Suspense fallback={<MainSectionLoader />}><SectionItems promise={data.newItems} /></Suspense></Section>
              <Section href="/archive" icon={<FileText className="size-5" />} title="Последние рецензии">
                <Suspense fallback={<MainSectionLoader />}><SectionItems promise={data.reviews} /></Suspense>
              </Section>
            </div>
            {currentAuthor ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:col-span-2 xl:row-start-3">
                <Section href="/archive?sort=my_rating_date&mine=rated" icon={<Star className="size-5" />} title="Мои последние оценки"><Suspense fallback={<MainSectionLoader />}><SectionItems promise={data.latestRatings} /></Suspense></Section>
                <Section href="/archive?mine=wanted" icon={<Bookmark className="size-5" />} title="Желаемое"><Suspense fallback={<MainSectionLoader />}><SectionItems promise={data.wanted} /></Suspense></Section>
              </div>
            ) : (
              <section className="archive-paper archive-panel flex items-center justify-center px-5 py-4 xl:col-span-2 xl:row-start-3 xl:h-[200px]">
                <div className="flex w-full max-w-5xl flex-col items-center justify-center gap-5 md:flex-row md:gap-8">
                  <Image
                    src="/placeholder.png"
                    alt=""
                    aria-hidden="true"
                    width={800}
                    height={439}
                    className="h-auto w-60 shrink-0 object-contain sm:w-64"
                  />
                  <div className="min-w-0 text-center md:text-left">
                    <h2 className="font-serif text-2xl text-stone-950 sm:text-3xl">
                      Ваши персональные разделы появятся здесь
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                      Когда вы начнете оценивать и добавлять записи в желаемое, здесь появятся новые разделы.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                      <MainLoginButton />
                      <Link href="/archive" className="archive-control-surface inline-flex h-10 items-center justify-center rounded-md border border-stone-300/80 px-4 font-mono text-xs uppercase tracking-wider hover:border-stone-700">
                        <Archive className="mr-2 size-4" />
                        Каталог
                      </Link>
                      <Suspense fallback={<MainSectionLoader minHeight="min-h-10" />}><RandomDossierLink promise={dossierPromise} /></Suspense>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-3 xl:contents">
            <section className="archive-paper archive-panel relative !overflow-visible xl:col-start-2 xl:row-start-1">
              <div className="relative z-10 p-4 sm:px-5 sm:pt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/clip-transparent-trimmed.png"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-2 right-4 z-50 h-16 w-auto object-contain drop-shadow-[0_8px_9px_rgba(28,25,23,0.22)]"
                />
                <div className="mb-4 border-b border-stone-400/25 pb-3">
                  <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"><Sparkles className="size-5 text-red-950/70" />Досье дня</h2>
                </div>
                <Suspense fallback={<MainSectionLoader minHeight="min-h-44" />}><DossierContent enabledMediaTypeCodes={enabledMediaTypeCodes} mediaTypes={mediaTypes} promise={dossierPromise} /></Suspense>
              </div>
            </section>
            <section className="archive-paper archive-panel min-h-0 p-4 xl:col-start-2 xl:row-start-2 xl:overflow-hidden xl:[contain:size]">
              <h2 className="mb-2 flex items-center gap-2 font-serif text-2xl"><Info className="size-5 text-red-950/70" />Об архиве</h2>
              <Suspense fallback={<MainSectionLoader minHeight="min-h-64" />}><AboutArchive promise={data.about} /></Suspense>
            </section>
          </aside>
        </div>

        <Suspense fallback={(
          <Section href="/series" icon={<Shuffle className="size-5" />} title="Случайная серия">
            <MainSectionLoader minHeight="min-h-52" />
          </Section>
        )}>
          <RandomFranchiseSection promise={randomFranchisePromise} />
        </Suspense>

        <footer className="archive-paper archive-panel flex flex-wrap items-center justify-center gap-y-2 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600 sm:px-5">
          {[
            String(new Date().getFullYear()),
            "О проекте",
            "Правила",
            "Помощь",
            "Обратная связь",
          ].map((label, index) => (
            <span
              key={label}
              className={index === 0 ? "px-3 first:pl-0" : "border-l border-stone-400/40 px-3"}
            >
              {index === 0 ? (
                label
              ) : (
                <a aria-disabled="true" className="cursor-default" tabIndex={-1}>
                  {label}
                </a>
              )}
            </span>
          ))}
        </footer>
      </div>
    </main>
  );
}
