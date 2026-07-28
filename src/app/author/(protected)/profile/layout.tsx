import { ProfileNav } from "./profile-nav";

export default function AuthorProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div>
        <h1 className="font-serif text-4xl">Профиль</h1>
        <p className="mt-2 text-stone-600">
          Настройки аккаунта и активных входов.
        </p>
      </div>

      <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <ProfileNav />
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
