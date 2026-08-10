import { cn } from "@/lib/common/utils";

export function NotificationBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;

  return (
    <span
      aria-label={`Новых заявок: ${count}`}
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-red-700 px-1.5 text-center font-mono text-[10px] font-semibold leading-5 tracking-normal text-white shadow-sm",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
