import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { getPersonalDataConsentSettings } from "@/db/queries/personal-data-consent";
import { CURRENT_CONSENT_VERSION } from "@/lib/privacy/consent";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  const settings = await getPersonalDataConsentSettings();
  if (!settings.requireConsent) notFound();
  const header = await getPublicSiteHeaderState();
  const operatorDetails = settings.operatorDetails.trim();
  const contact = settings.contact.trim();
  return <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7"><div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
    <PublicSiteHeader {...header.headerProps} />
    <article className="archive-paper archive-panel mx-auto w-full max-w-4xl flex-1 space-y-6 p-5 text-sm leading-7 text-stone-700 sm:p-8">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-900">Гикотека · Документы</p>
      <h1 className="font-semibold text-4xl leading-tight text-stone-950">Согласие на обработку персональных данных</h1>
      <p className="border-b border-stone-500/25 pb-5 text-stone-600">Версия: {CURRENT_CONSENT_VERSION}. Согласие предоставляется только при явном подтверждении пользователем.</p>
      {operatorDetails || contact ? (
        <section><h2 className="font-semibold text-2xl text-stone-950">Оператор и обращения</h2><p className="whitespace-pre-wrap">{operatorDetails || "Сведения об операторе пока не опубликованы."}</p><p className="whitespace-pre-wrap">Контакт для обращений и отзыва согласия: {contact || "контакт пока не опубликован."}</p></section>
      ) : null}
      <section><h2 className="font-semibold text-2xl text-stone-950">Данные и цели обработки</h2><p>Я разрешаю оператору обрабатывать сведения аккаунта: имя и логин, email при его указании, данные входа и связанных аккаунтов Яндекс ID или VK ID (при подключении соответствующего способа входа), идентификаторы аккаунта, оценки, статусы записей, рецензии, настройки и другую информацию, которую я передаю сервису. Для работы входа и защиты сайта также обрабатываются технические сведения: IP-адрес, браузер, необходимые cookies, сессии и события безопасности.</p><p>Цели: создание и обслуживание аккаунта, предоставление профиля, оценок, рецензий, коллекций и социальных функций, подтверждение email и восстановление доступа, уведомления, модерация и защита сервиса. Обработка включает сбор, запись, систематизацию, хранение, уточнение, использование, передачу исполнителям необходимых функций и удаление; она может выполняться автоматически.</p></section>
      <section><h2 className="font-semibold text-2xl text-stone-950">Сервисы и передача данных</h2><p>Сайт использует размещённую инфраструктуру для работы приложения и хранения данных. При соответствующих действиях могут участвовать Яндекс ID и, после подключения этого способа входа, VK ID для авторизации, Resend для отправки email и Cloudflare Turnstile для защиты от автоматических запросов. Эти сервисы получают необходимые для их функций сведения и обрабатывают их по своим условиям.</p><p>Дополнительные функции ИИ и Telegram могут передавать выбранному поставщику данные, необходимые для запрошенной функции, при её использовании. Не передавайте через такие функции сведения, которыми не хотите делиться с их поставщиками.</p><p>Google Analytics включается по отдельному согласию на аналитику. Это согласие на персональные данные не заменяет выбор аналитических cookies. Подробнее — в <Link href="/privacy" className="underline">политике конфиденциальности</Link>.</p></section>
      <section><h2 className="font-semibold text-2xl text-stone-950">Срок и отзыв</h2><p>Согласие действует до достижения указанных целей или его отзыва. Данные аккаунта хранятся, пока аккаунт используется и они нужны для перечисленных целей. Для отзыва, уточнения или удаления данных обратитесь к оператору {contact ? "по опубликованному выше контакту" : "через доступные каналы связи сервиса"} и укажите, к какому аккаунту относится запрос. Оператор проверит обращение и согласует порядок удаления. После отзыва использование аккаунта требует нового согласия. Отзыв не удаляет автоматически публикации и историю обработки; вопросы удаления рассматриваются отдельно с учётом применимых требований.</p><p>Можно отказаться от согласия и выйти из аккаунта, продолжив просмотр публичного архива. Демо-данные хранятся на устройстве; после входа и принятия согласия локальная история может быть перенесена в аккаунт.</p></section>
      {settings.requireConsent ? <Link href="/author/consent" className="underline">Перейти к подтверждению согласия</Link> : null}
    </article>
  </div></main>;
}
