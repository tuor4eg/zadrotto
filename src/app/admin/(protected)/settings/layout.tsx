import { PageHeader } from "../admin-ui";
import { SettingsNav } from "./settings-nav";

export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader
        title="Настройки"
        description="Параметры админского доступа и сервисных подсистем."
      />

      <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav />
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
