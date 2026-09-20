import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const headerState = await getPublicSiteHeaderState();

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <article className="archive-paper archive-panel flex-1 p-5 sm:p-7">
          <div className="space-y-6 text-sm leading-7 text-stone-700">
            <div>
              <h1 className="font-serif text-4xl leading-tight text-stone-950 sm:text-5xl">
                Политика конфиденциальности
              </h1>
              <p className="mt-3">Последнее обновление: 20 сентября 2026 года.</p>
            </div>
            <section>
              <h2 className="font-serif text-2xl text-stone-950">Аналитика</h2>
              <p className="mt-2">
                С вашего разрешения сайт использует Google Analytics 4 для сбора статистики
                посещений: просмотренных страниц, источников перехода, примерного
                региона, типа устройства и браузера. Мы не отправляем в аналитику логины, email,
                тексты рецензий и другие введённые вами данные.
              </p>
            </section>
            <section>
              <h2 className="font-serif text-2xl text-stone-950">Cookies и выбор пользователя</h2>
              <p className="mt-2">
                До согласия скрипт Google Analytics не загружается. При согласии Google может
                установить cookies с префиксом <code>_ga</code>. Вы можете изменить решение через
                кнопку «Cookies» внизу сайта; при отказе доступные сайту аналитические cookies
                удаляются.
              </p>
            </section>
            <section>
              <h2 className="font-serif text-2xl text-stone-950">Необходимое хранение</h2>
              <p className="mt-2">
                Отдельные cookies и локальные данные могут использоваться для входа, безопасности,
                настроек интерфейса и демо-режима. Они необходимы для запрошенных функций сайта и
                не используются Google Analytics без вашего согласия.
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
