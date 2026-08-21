import type { LucideIcon } from "lucide-react";

export type AuthorStatisticItem = {
  Icon: LucideIcon;
  label: string;
  value: React.ReactNode;
};

export function AuthorStatisticList({ items }: { items: readonly AuthorStatisticItem[] }) {
  return (
    <div className="divide-y divide-dashed divide-stone-400/35">
      {items.map(({ Icon, label, value }) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2">
          <span className="flex items-center gap-2 font-serif text-lg">
            <Icon className="size-4 text-red-950/65" />
            {label}
          </span>
          <strong className="shrink-0 font-mono text-sm font-normal tabular-nums text-stone-600">
            {value}
          </strong>
        </div>
      ))}
    </div>
  );
}
