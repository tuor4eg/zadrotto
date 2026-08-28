import type { Metadata } from "next";
import Image from "next/image";

import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { getSubmittedModerationRequestCountForAdmin } from "@/db/queries/admin-moderation-queue";

export const metadata: Metadata = {
  title: 'Правила — Журнал "Задротто"',
  description: "Правила культурного архива для читателей и авторов.",
};

const sections = [
  {
    title: "Сначала доверьтесь поиску",
    paragraphs: [
      "Большинство сведений о произведениях архив получает из публичных баз данных. Обычно достаточно найти нужную запись, выбрать подходящий результат — и название, год, обложка и прочие известные человечеству факты подтянутся автоматически.",
      "Перед добавлением проверьте, нет ли такой записи в архиве. Две одинаковые карточки не делают произведение вдвое лучше, хотя некоторые режиссёрские версии пытаются доказать обратное.",
      "Иногда нужной вещи нет ни в одной подключённой базе. В таком случае запись можно заполнить вручную. Постарайтесь точно указать хотя бы основные сведения: название, тип медиа и год, если он известен. Ошибиться не страшно, но превращать догадку в исторический факт всё же не стоит.",
      "После публикации запись становится частью общего архива. Это не личная собственность добавившего её автора: редакция может исправлять и дополнять фактические данные.",
    ],
  },
  {
    title: "Оценка — это мнение, а не приговор",
    paragraphs: [
      "Ставьте ту оценку, которую считаете честной. Не нужно подгонять её под среднее, мнение друзей, Metacritic или фазу Луны.",
      "Высокая оценка не требует оправданий, низкая — тоже. Но если хочется объяснить, почему шедевр получил четыре балла, для этого есть заметка или рецензия. Возможно, человечество всё-таки заслуживает узнать правду.",
    ],
  },
  {
    title: "Пишите своими словами",
    paragraphs: [
      "Рецензия может быть серьёзной, личной, смешной, восторженной или раздражённой. Главное, чтобы в ней была ваша мысль, а не пересказ чужого текста.",
      "Не публикуйте плагиат, бессмысленный набор слов, рекламу и материалы, нарушающие чужие права. Если без сюжетных подробностей никак, предупредите о спойлерах заранее. Не все готовы узнать имя убийцы на второй строке.",
      "Рецензии проходят проверку перед публикацией. Текст могут вернуть на доработку, отклонить или скрыть, если он нарушает правила. Это не тайный заговор редакции, а обычная попытка сохранить архив пригодным для чтения.",
    ],
  },
  {
    title: "Критикуйте произведения, а не людей",
    paragraphs: [
      "Можно не любить популярную игру, классический роман, модного режиссёра и финал сериала, который все остальные называют гениальным. Нельзя переходить на оскорбления, травлю, угрозы и дискриминацию.",
      "Спорьте с мнением, а не с человеком. Фраза «я вижу это иначе» обычно работает лучше, чем капслок, даже если капслок кажется убедительнее.",
    ],
  },
  {
    title: "Не приносите то, за что потом неловко",
    paragraphs: [
      "Запрещены незаконные материалы, вредоносные ссылки, спам, реклама без согласования и содержимое, созданное только ради провокации или вреда.",
      "Личные данные других людей тоже оставьте при них. Архив собирает культурную память, а не компромат.",
    ],
  },
  {
    title: "Если что-то пошло не так",
    paragraphs: [
      "Редакция может исправлять фактические данные, возвращать материалы на доработку, отклонять или скрывать публикации. За повторные либо серьёзные нарушения доступ автора может быть ограничен или заблокирован.",
      "Ошибки случаются, контекст теряется, кнопки иногда нажимаются раньше мысли. Если решение кажется несправедливым, его можно будет обсудить.",
    ],
  },
  {
    title: "И последнее",
    paragraphs: [
      "Не обязательно писать как литературный критик, знать все даты или помнить номер диска из журнала за 1998 год. Достаточно быть честным, внимательным к другим и приносить в архив что-нибудь осмысленное.",
      "Остальное постепенно разложим по карточкам.",
    ],
  },
] as const;

export default async function RulesPage() {
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
              <h1 className="font-serif text-4xl leading-none sm:text-5xl">Правила архива</h1>
              <div className="mt-6 space-y-4 text-base leading-7 text-stone-700">
                <p>
                  Добро пожаловать в журнал «Задротто». Здесь мы собираем игры, фильмы,
                  книги, комиксы и другие культурные находки, о которых хочется помнить чуть дольше,
                  чем до следующего понедельника.
                </p>
                <p>
                  Правил немного. В основном они сводятся к простой мысли: пополняйте архив с
                  интересом, спорьте с уважением и не превращайте картотеку в поле боя.
                </p>
              </div>
            </div>
            <Image
              alt=""
              className="h-auto w-40 justify-self-center sm:w-48 sm:justify-self-end"
              height={525}
              src="/mascot/deadz_rulez.png"
              unoptimized
              width={420}
            />
          </div>
        </article>

        {sections.map((section) => (
          <section className="archive-paper archive-panel p-5 sm:p-6" key={section.title}>
            <h2 className="font-serif text-2xl">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
