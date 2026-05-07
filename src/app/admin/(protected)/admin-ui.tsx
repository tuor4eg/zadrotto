import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p> : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
  );
}

export function EmptyState({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-8 text-center text-sm text-stone-500",
        className,
      )}
    >
      {children}
    </div>
  );
}
