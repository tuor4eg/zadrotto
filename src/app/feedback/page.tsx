import type { Metadata } from "next";

import { ArchiveSiteHeader } from "@/components/archive/archive-site-header";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export const metadata: Metadata = {
  title: "Обратная связь — Журнал, которого не было",
  description: "Как связаться с редакцией культурного архива.",
};

export default async function FeedbackPage() {
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
          <h1 className="font-serif text-4xl leading-none sm:text-5xl">Обратная связь</h1>
          <div className="mt-6 space-y-4 text-base leading-7 text-stone-700">
            <p>
              Если вы нашли ошибку, хотите предложить улучшение или просто обсудить архив,
              напишите в Telegram.
            </p>
            <a
              className="inline-flex rounded-full bg-[var(--archive-bg-end)] px-4 py-2 font-mono text-sm font-medium text-stone-100 transition-colors hover:bg-[var(--archive-bg-start)] hover:text-white"
              href="https://t.me/zadrotto"
              rel="noreferrer"
              target="_blank"
            >
              Telegram · @zadrotto
            </a>
          </div>
        </article>
      </div>
    </main>
  );
}
