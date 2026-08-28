import type { Metadata } from "next";
import Image from "next/image";

import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { getSubmittedModerationRequestCountForAdmin } from "@/db/queries/admin-moderation-queue";

export const metadata: Metadata = {
  title: 'О проекте — Журнал "Задротто"',
  description: "О культурном архиве, его источниках данных, лицензии и использовании ИИ.",
};

const DATA_PROVIDERS = [
  ["TMDB", "https://www.themoviedb.org/"],
  ["Comic Vine", "https://comicvine.gamespot.com/"],
  ["Open Library", "https://openlibrary.org/"],
  ["Google Books", "https://books.google.com/"],
  ["FantLab", "https://fantlab.ru/"],
  ["IGDB", "https://www.igdb.com/"],
  ["RAWG", "https://rawg.io/"],
  ["Jikan", "https://jikan.moe/"],
  ["AniList", "https://anilist.co/"],
  ["Roblox", "https://www.roblox.com/"],
] as const;

const externalLinkClassName =
  "font-medium text-red-950 underline decoration-stone-400 underline-offset-4 hover:decoration-red-950";

export default async function AboutPage() {
  const [currentAuthor, currentAdmin] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const [incomingFriendRequestCount, submittedRequestCount] = await Promise.all([
    currentAuthor ? getIncomingFriendRequestCount(currentAuthor.id) : 0,
    currentAdmin ? getSubmittedModerationRequestCountForAdmin() : 0,
  ]);

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <ArchiveSiteHeader
          brandHref="/"
          currentAdminUser={Boolean(currentAdmin)}
          currentAuthor={Boolean(currentAuthor)}
          incomingFriendRequestCount={incomingFriendRequestCount}
          submittedRequestCount={submittedRequestCount}
          variant="main"
        />

        <article className="archive-paper archive-panel archive-stack archive-stack-left p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-7">
            <div>
              <h1 className="font-serif text-4xl leading-none sm:text-5xl">О проекте</h1>
              <div className="mt-6 space-y-4 text-base leading-7 text-stone-700">
                <p>
                  Журнал «Задротто» — это личный архив игр, фильмов, книг, комиксов,
                  сериалов и других культурных находок. Здесь записи собираются не ради полноты
                  каталога, а чтобы не потерять впечатления, связи и случайные маршруты между ними.
                  Сейчас проект больше похож на живую картотеку: в ней есть факты, оценки, заметки,
                  темы и серии. Со временем из этой базы могут вырасти подборки, эссе и выпуски того
                  самого воображаемого журнала. Важны не только громкие произведения, но и вещи,
                  которые однажды попались в нужный момент и остались в памяти. Поэтому архив хранит
                  факты, а будущий журнал сможет доставать из них истории. Проект развивается как
                  ранний эксперимент, так что его форма ещё может меняться.
                </p>
              </div>
            </div>
            <Image
              alt=""
              className="h-auto w-40 justify-self-center sm:w-48 sm:justify-self-end"
              height={462}
              src="/mascot/deadz.png"
              unoptimized
              width={294}
            />
          </div>
        </article>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Источники данных и обложек</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Для поиска метаданных и изображений проект обращается к следующим сервисам:
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {DATA_PROVIDERS.map(([name, href]) => (
              <li key={name}>
                <a className={externalLinkClassName} href={href} rel="noreferrer" target="_blank">
                  {name}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-stone-300/80 pt-5">
            <a
              aria-label="Официальный сайт TMDB"
              className="inline-block"
              href="https://www.themoviedb.org/"
              rel="noreferrer"
              target="_blank"
            >
              <Image
                alt="TMDB"
                className="h-9 w-auto max-w-full"
                height={36}
                src="/tmdb-logo.svg"
                width={273}
              />
            </a>
            <p className="mt-3 font-mono text-xs leading-5 text-stone-600">
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </div>
          <p className="mt-5 text-sm leading-6 text-stone-600">
            Права на обложки, изображения и связанные материалы принадлежат их правообладателям.
          </p>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">ИИ-инструменты</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Проект может использовать{" "}
            <a
              className={externalLinkClassName}
              href="https://openrouter.ai/"
              rel="noreferrer"
              target="_blank"
            >
              OpenRouter
            </a>{" "}
            и{" "}
            <a
              className={externalLinkClassName}
              href="https://www.deepseek.com/"
              rel="noreferrer"
              target="_blank"
            >
              DeepSeek
            </a>{" "}
            как вспомогательные инструменты для отдельных операций с картотекой. Результат ИИ
            не считается источником истины и проверяется человеком перед использованием.
          </p>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Лицензия</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Исходный код проекта опубликован на{" "}
            <a
              className={externalLinkClassName}
              href="https://github.com/tuor4eg/zadrotto"
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>{" "}
            по лицензии{" "}
            <a
              className={externalLinkClassName}
              href="https://github.com/tuor4eg/zadrotto/blob/main/LICENSE"
              rel="noreferrer"
              target="_blank"
            >
              GNU GPLv3
            </a>. Эта лицензия относится к исходному коду проекта и не распространяется на сторонние
            обложки, изображения, метаданные и другие материалы их правообладателей.
          </p>
        </section>
      </div>
    </main>
  );
}
