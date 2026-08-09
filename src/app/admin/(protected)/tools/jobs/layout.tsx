import { ListTodo } from "lucide-react";

import { PageHeader } from "../../admin-ui";
import { JobsToolsNav } from "./jobs-tools-nav";

export default function JobsToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Фоновые задачи"
        description="Расписания, политика выполнения и журнал запусков."
        aside={<ListTodo className="size-5 text-stone-500" />}
      />
      <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <JobsToolsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
