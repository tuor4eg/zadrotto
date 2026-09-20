import { ProfileNav } from "./profile-nav";

export default function AuthorProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="author-dashboard min-w-0">
      <div className="archive-paper-surface archive-panel min-w-0 p-5 sm:p-6">
        <div>
          <h1 className="font-serif text-4xl">Профиль</h1>
          <p className="mt-2 text-stone-600">
            Настройки аккаунта, интересов и активных входов.
          </p>
        </div>

        <div className="mt-5 grid min-w-0 gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <ProfileNav />
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
