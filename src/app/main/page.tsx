import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import {
  Archive,
  BookOpen,
  Bookmark,
  Clapperboard,
  Clock3,
  FileText,
  Gamepad2,
  Info,
  PanelsTopLeft,
  Shapes,
  Shield,
  Shuffle,
  Sparkles,
  Star,
  Tv,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

import { ArchiveCover } from "@/app/media-item-tile";
import {
  getMainPageData,
  getRecentlyViewedMediaItems,
  MAIN_PAGE_RECENT_SECTION_SIZE,
} from "@/db/queries/main-page";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getDailyDossier } from "@/lib/main-page/daily-dossier";
import {
  getRecentlyViewedIds,
  removeRecentlyViewedIds,
} from "@/lib/main-page/recently-viewed";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
import {
  AVERAGE_RATING_TEXT_TONE_CLASS_NAMES,
  getRatingTone,
} from "@/lib/ratings/tone";
import { ResponsiveTileGrid } from "./responsive-tile-grid";
import { MainLoginButton } from "./main-login-button";

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
  href?: string;
  icon: React.ReactNode;
  title: string;
};

function Section({ children, className, href = "/", icon, title }: SectionProps) {
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

export default async function MainPage() {
  await connection();

  const [currentAuthor, currentAdmin] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const effectiveMediaTypes = await getEffectiveMediaTypeOptions(currentAuthor?.id);
  const mediaTypes = effectiveMediaTypes.filter((item) => item.isEnabled);
  const enabledMediaTypeCodes = mediaTypes.map((item) => item.code);
  const accessibleMediaTypeCodes = effectiveMediaTypes.map((item) => item.code);
  const [{ counts, sections, totalCount }, globalDossierItem, recentlyViewedIds] = await Promise.all([
    getMainPageData({
      currentAuthorId: currentAuthor?.id,
      enabledMediaTypeCodes,
    }),
    getDailyDossier(currentAuthor?.id),
    currentAuthor
      ? getArchiveSettings().then((settings) =>
          getRecentlyViewedIds(currentAuthor.id, settings.recentlyViewedHistoryLimit),
        )
      : Promise.resolve([]),
  ]);
  const recentlyViewedItems = currentAuthor
    ? await getRecentlyViewedMediaItems({
        accessibleMediaTypeCodes,
        authorId: currentAuthor.id,
        ids: recentlyViewedIds,
      })
    : [];
  if (currentAuthor) {
    const validIds = new Set(recentlyViewedItems.map((item) => item.id));
    await removeRecentlyViewedIds(
      currentAuthor.id,
      recentlyViewedIds.filter((id) => !validIds.has(id)),
    );
  }
  const recentItems = recentlyViewedItems
    .filter((item) => enabledMediaTypeCodes.includes(item.mediaType))
    .slice(0, MAIN_PAGE_RECENT_SECTION_SIZE);
  const dossierItem = globalDossierItem
    && enabledMediaTypeCodes.includes(globalDossierItem.mediaType)
    ? globalDossierItem
    : null;
  const dossierRatingClassName = dossierItem
    ? AVERAGE_RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(dossierItem.averageScore)]
    : "";
  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <header className="archive-paper archive-panel flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-7">
          <Link href="/" className="flex min-w-0 items-center gap-4">
            <Image
              src="/site-logo.png"
              alt=""
              width={56}
              height={56}
              className="size-12 shrink-0 object-contain sm:size-14"
              priority
            />
            <span className="min-w-0">
              <span className="block truncate font-serif text-2xl leading-tight sm:text-4xl">Журнал, которого не было</span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.18em] text-stone-600 sm:text-[10px]">База хранит факты. Журнал достает из них память.</span>
            </span>
          </Link>
          <nav className="flex shrink-0 gap-2">
            {currentAdmin ? <Link className="archive-control-surface inline-flex h-10 items-center gap-2 rounded-md border border-stone-300/80 px-3 font-mono text-xs uppercase tracking-wider" href="/admin"><Shield className="size-4" />Админка</Link> : null}
            <Link className="archive-control-surface inline-flex h-10 items-center gap-2 rounded-md border border-stone-300/80 px-3 font-mono text-xs uppercase tracking-wider" href={currentAuthor ? "/author" : "/author/login"}><UserCircle className="size-5" />{currentAuthor ? "Профиль" : "Войти"}</Link>
          </nav>
        </header>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[auto_auto_auto]">
          <div className="flex min-w-0 flex-col gap-3 xl:contents">
            <Section className="xl:col-start-1 xl:row-start-1" href="/?sort=average_score" icon={<Star className="size-5" />} title="Топ архива"><ResponsiveTileGrid items={sections.top} variant="top" /></Section>
            <div className="grid gap-3 lg:grid-cols-2 xl:col-start-1 xl:row-start-2">
              <Section href="/?sort=created_at" icon={<Clock3 className="size-5" />} title="Новое в базе"><ResponsiveTileGrid items={sections.newItems} /></Section>
              <Section icon={<FileText className="size-5" />} title="Последние рецензии">
                <ResponsiveTileGrid items={sections.reviews} />
              </Section>
            </div>
            {currentAuthor ? (
              <div className="grid gap-3 lg:grid-cols-2 xl:col-start-1 xl:row-start-3">
                <Section href="/history" icon={<Archive className="size-5" />} title="Недавно просмотренное"><ResponsiveTileGrid items={recentItems} /></Section>
                <Section href="/?mine=wanted" icon={<Bookmark className="size-5" />} title="Желаемое"><ResponsiveTileGrid items={sections.wanted} /></Section>
              </div>
            ) : (
              <section className="archive-paper archive-panel flex items-center justify-center px-5 py-4 xl:col-start-1 xl:row-start-3 xl:h-[200px]">
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
                      Когда вы начнете открывать досье и добавлять записи в желаемое, здесь появятся новые разделы.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                      <MainLoginButton />
                      <Link href="/" className="archive-control-surface inline-flex h-10 items-center justify-center rounded-md border border-stone-300/80 px-4 font-mono text-xs uppercase tracking-wider hover:border-stone-700">
                        <Archive className="mr-2 size-4" />
                        Каталог
                      </Link>
                      <Link href={dossierItem ? `/media/${dossierItem.code}` : "/"} className="archive-control-surface inline-flex h-10 items-center justify-center rounded-md border border-stone-300/80 px-4 font-mono text-xs uppercase tracking-wider hover:border-stone-700">
                        <Shuffle className="mr-2 size-4" />
                        Случайное досье
                      </Link>
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
                {dossierItem ? <div className="grid items-stretch grid-cols-[minmax(0,7rem)_1fr] gap-4 xl:[grid-template-columns:calc((min(1480px,calc(100vw_-_3.5rem))_-_444px)/7)_minmax(0,1fr)]"><Link href={`/media/${dossierItem.code}`} className="block aspect-[2/3] overflow-hidden rounded-md border border-stone-300/80 bg-stone-100"><ArchiveCover carrierFrame={false} item={{ ...dossierItem, coverUrl: dossierItem.coverThumbUrl ?? dossierItem.coverUrl }} className="h-full w-full" /></Link><div className="flex min-h-0 min-w-0 flex-col overflow-hidden [contain:size]"><h3 className="line-clamp-2 font-serif text-xl" title={dossierItem.title}>{dossierItem.title}</h3><p className="mt-1 truncate font-mono text-xs uppercase tracking-wider text-stone-600">{mediaTypes.find((type) => type.code === dossierItem.mediaType)?.name ?? dossierItem.mediaType}{dossierItem.releaseYear ? ` · ${dossierItem.releaseYear}` : ""}</p><div className="mt-3 shrink-0"><FiveStarRating className={dossierRatingClassName} score={dossierItem.averageScore} /><p className="mt-2 font-mono text-xs text-stone-600">{formatRatingsCount(dossierItem.ratingsCount)}</p></div><Link href={`/media/${dossierItem.code}`} className="archive-control-surface mt-auto flex h-10 shrink-0 items-center justify-center rounded-md border border-stone-300/80 px-3 text-center font-mono text-xs uppercase tracking-wider">Открыть</Link></div></div> : <p className="py-8 text-center font-mono text-sm text-stone-500">Досье появится вместе с первой записью.</p>}
              </div>
            </section>
            <section className="archive-paper archive-panel min-h-0 p-5 xl:col-start-2 xl:row-span-2 xl:row-start-2 xl:overflow-hidden xl:[contain:size]">
              <h2 className="mb-4 flex items-center gap-2 font-serif text-2xl"><Info className="size-5 text-red-950/70" />Об архиве</h2>
              <div className="divide-y divide-dashed divide-stone-400/35">
                <div className="flex items-center justify-between py-3"><span className="font-mono text-xs uppercase tracking-wider text-stone-600">Всего записей</span><strong className="font-serif text-2xl">{totalCount.toLocaleString("ru-RU")}</strong></div>
                {counts.map((item) => {
                  const MediaTypeIcon = MEDIA_TYPE_ICONS[item.mediaType] ?? Archive;

                  return (
                    <div key={item.mediaType} className="flex items-center justify-between gap-4 py-1">
                      <span className="flex items-center gap-2 font-serif text-lg">
                        <MediaTypeIcon aria-hidden="true" className="size-4 text-red-950/65" />
                        {item.mediaTypeName}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-stone-600">
                        {item.count.toLocaleString("ru-RU")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>

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
