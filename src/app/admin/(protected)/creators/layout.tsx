import { CreatorsNav } from "./creators-nav";

export default function CreatorsLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
    <aside className="lg:sticky lg:top-20 lg:self-start"><CreatorsNav /></aside>
    <div className="min-w-0">{children}</div>
  </div>;
}
