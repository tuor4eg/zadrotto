import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";

export const dynamic = "force-dynamic";

type AuthorLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthorLayout({ children }: AuthorLayoutProps) {
  const author = await requireAuthor();
  const headerState = await getPublicSiteHeaderState(author);

  return (
    <main className="archive-page flex min-h-screen min-w-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />

        <section
          className="archive-paper-surface archive-panel author-content-shell media-carrier-font-pc-steam flex min-w-0 flex-1 flex-col p-5 sm:p-6 [&_*]:[font-family:inherit]"
          style={{ overflow: "visible" }}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
