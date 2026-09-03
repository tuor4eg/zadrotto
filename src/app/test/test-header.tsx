import Image from "next/image";
import Link from "next/link";
import { Bell, Search } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";

type TestHeaderProps = {
  author: {
    avatarObjectKey: string | null;
    name: string;
  } | null;
};

const MENU_ITEMS = [
  { href: "/archive", label: "Досье" },
  { href: "/series", label: "Серии" },
  { href: "/collections", label: "Подборки" },
] as const;

export function TestHeader({ author }: TestHeaderProps) {
  return (
    <header className="flex h-14 items-center gap-2 px-1 lg:gap-4">
      <Link href="/test" aria-label="Главная" className="flex shrink-0 items-center gap-2">
        <Image
          src="/site-logo.png"
          alt=""
          width={36}
          height={36}
          className="size-8 object-contain sm:size-9"
          priority
        />
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-100">
          Архив
        </span>
      </Link>

      <nav aria-label="Основная навигация" className="hidden items-center gap-3 lg:flex">
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-300 transition-colors hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <form action="/archive" method="get" role="search" aria-label="Поиск по архиву" className="min-w-0">
          <label className="sr-only" htmlFor="test-header-search">
            Поиск по архиву
          </label>
          <div className="relative w-full sm:w-56 lg:w-60">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-500"
            />
            <input
              id="test-header-search"
              name="q"
              type="search"
              autoComplete="off"
              className="archive-control-surface h-8 w-full appearance-none rounded-lg border-0 pl-8 pr-3 text-xs text-stone-950 shadow-none outline-none placeholder:text-stone-500 focus:ring-2 focus:ring-stone-400/40"
              placeholder="Поиск"
            />
          </div>
        </form>

        <button
          type="button"
          aria-label="Уведомления"
          className="grid size-8 shrink-0 place-items-center rounded-full text-stone-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Bell className="size-4" />
        </button>

        <Link
          href={author ? "/author" : "/author/login"}
          aria-label={author ? "Перейти к статистике" : "Войти"}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-700 focus-visible:ring-offset-2"
        >
          <Avatar
            name={author?.name ?? "Гость"}
            objectKey={author?.avatarObjectKey}
            className="size-8 text-xs"
          />
        </Link>
      </div>
    </header>
  );
}
