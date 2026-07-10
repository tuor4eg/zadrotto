import { PageHeader } from "../../admin-ui";
import { ProvidersNav } from "./providers-nav";

export default function AdminProvidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader
        title="Провайдеры"
        description="Авторизация, включение, порядок и лимиты внешних источников."
      />

      <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <ProvidersNav />
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
