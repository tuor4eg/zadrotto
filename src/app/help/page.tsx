import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export const metadata: Metadata = {
  title: "Помощь — Журнал, которого не было",
  description: "Короткие ответы о поиске, оценках и пополнении культурного архива.",
};

const linkClassName =
  "font-medium text-red-950 underline decoration-stone-400 underline-offset-4 hover:decoration-red-950";

export default async function HelpPage() {
  const [currentAuthor, currentAdmin] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
  ]);
  const incomingFriendRequestCount = currentAuthor
    ? await getIncomingFriendRequestCount(currentAuthor.id)
    : 0;

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <ArchiveSiteHeader
          brandHref="/"
          currentAdminUser={Boolean(currentAdmin)}
          currentAuthor={Boolean(currentAuthor)}
          incomingFriendRequestCount={incomingFriendRequestCount}
          variant="main"
        />

        <article className="archive-paper archive-panel archive-stack archive-stack-left p-5 sm:p-7">
          <h1 className="font-serif text-4xl leading-none sm:text-5xl">Помощь</h1>
          <p className="mt-6 text-base leading-7 text-stone-700">
            Архив устроен довольно просто, но некоторые кнопки умеют прятаться с достоинством
            опытного шпиона. Ниже — короткие ответы о том, где искать записи, как делиться
            впечатлениями и куда исчезает предложение после публикации.
          </p>
        </article>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Что здесь можно делать без аккаунта?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Смотреть архив, искать записи, изучать серии, читать рецензии и сравнивать оценки.
              Для спокойного культурного любопытства регистрация не требуется.
            </p>
            <p>
              Аккаунт автора понадобится, если захочется ставить оценки, собирать личные списки,
              писать рецензии или предлагать новые записи.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Как войти в аккаунт автора?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Нажмите «Войти» в правой части шапки. После входа там появится кнопка «Профиль»,
              ведущая в кабинет автора.
            </p>
            <p>
              В кабинете находятся статистика, предложения, рецензии, профиль, друзья и настройки
              интересов. В общем, всё личное — в одном месте, чтобы не искать его по культурным
              слоям.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Как найти нужную запись?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Откройте{" "}
              <Link className={linkClassName} href="/archive">
                архив
              </Link>{" "}
              и введите название в строку поиска. Результаты можно отфильтровать по типу медиа,
              году и личному статусу, а затем отсортировать по названию, дате добавления или
              оценкам.
            </p>
            <p>
              Если поиск ничего не нашёл, проверьте другое написание или оригинальное название.
              Возможно, запись действительно отсутствует — либо просто решила представиться
              по-японски.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Как поставить оценку или отложить запись на потом?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Откройте страницу записи и найдите блок оценки. Там можно поставить целую оценку от
              1 до 10, добавить год знакомства и небольшую заметку.
            </p>
            <p>
              Если оценивать пока рано, запись можно отправить в «Желаемое» или отметить как
              «Пропущенное». Эти списки доступны через фильтры архива после входа.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Как добавить то, чего ещё нет в архиве?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              После входа откройте{" "}
              <Link className={linkClassName} href="/archive">
                архив
              </Link>{" "}
              и нажмите круглую кнопку «+» в левом нижнем углу. Откроется форма предложения, не
              заставляя вас покидать каталог и отправляться в путешествие по настройкам.
            </p>
            <p>
              Сначала выберите тип медиа и попробуйте найти произведение в подключённых публичных
              базах — большую часть полей архив заполнит сам. Если базы ничего не нашли, запись
              можно заполнить вручную.
            </p>
            <p>
              Черновик разрешается сохранить и продолжить позже, а готовую запись — отправить на
              проверку или сразу опубликовать, если это позволяет профиль доступа.
            </p>
            <p>
              Есть и второй путь: кабинет автора → «Предложения» → «Записи» → «Добавить». Он ведёт
              к той же задаче и пригодится, если вы уже разбираете свои черновики и не хотите
              возвращаться в архив ради одной кнопки.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Куда исчезло моё предложение?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Пока запись остаётся черновиком или ждёт проверки, она видна в разделе
              «Предложения» → «Записи». После публикации она переезжает в общий архив и исчезает
              из списка предложений.
            </p>
            <p>
              Это не баг и не архивный полтергейст: опубликованная запись становится общей частью
              картотеки. Фактические данные после этого поддерживает редакция, а ваша оценка и
              рецензия остаются вашим вкладом.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Как написать рецензию?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              Откройте нужную запись и выберите действие для создания рецензии. Текст можно
              сохранить как черновик, а затем отправить на проверку. Если профиль разрешает
              публикацию без проверки, рецензия появится в архиве сразу.
            </p>
            <p>
              Все свои тексты и их статусы можно найти в кабинете автора в разделе «Рецензии».
              Если редакция вернула материал с комментарием, он будет показан там же — сову с
              письмом ждать не придётся.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Как предложить или исправить серию?</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
            <p>
              На странице записи можно открыть управление сериями и предложить привязку к
              существующей серии, новую серию или изменение текущих связей. Доступные действия
              зависят от профиля автора.
            </p>
            <p>
              Состояние отправленных предложений отображается в кабинете: «Предложения» →
              «Серии». Если похожая серия уже существует, лучше выбрать её — размножение сущностей
              без необходимости расстраивает не только программистов.
            </p>
          </div>
        </section>

        <section className="archive-paper archive-panel p-5 sm:p-6">
          <h2 className="font-serif text-2xl">Где прочитать правила?</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            На странице{" "}
            <Link className={linkClassName} href="/rules">
              «Правила»
            </Link>
            . Там коротко рассказано о достоверности данных, оценках, рецензиях, общении и
            модерации — человеческим языком и без торжественного шелеста папок.
          </p>
        </section>
      </div>
    </main>
  );
}
