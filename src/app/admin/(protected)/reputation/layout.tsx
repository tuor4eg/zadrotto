import { PageHeader } from "../admin-ui";
import { ReputationNav } from "./reputation-nav";

export default function AdminReputationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Уровни и доверие"
        description="Уровень отражает вклад автора, а доверие отдельно определяет готовность к автопубликации."
      />

      <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <ReputationNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
