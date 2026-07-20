import { Mail } from "lucide-react";

import { PageHeader } from "../../admin-ui";
import { EmailToolsNav } from "./email-tools-nav";

export default function EmailToolsLayout({ children }: { children: React.ReactNode }) {
  return <div><PageHeader title="Email" description="Доставка системных писем, провайдер и очередь." aside={<Mail className="size-5 text-stone-500" />} />
    <div className="mt-5 grid gap-6 border-t border-stone-100 pt-5 lg:grid-cols-[220px_minmax(0,1fr)]"><aside className="lg:sticky lg:top-20 lg:self-start"><EmailToolsNav /></aside><div className="min-w-0">{children}</div></div>
  </div>;
}
