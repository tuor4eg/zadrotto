import Link from "next/link";
import type { ReactNode } from "react";

type PaginationNavProps = {
  basePath: string;
  itemLabel?: string;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  totalCount: number;
  totalPages: number;
  variant?: "admin" | "archive";
};

const VARIANT_STYLES = {
  admin: {
    nav: "rounded-md border border-stone-200 bg-white px-3 py-2",
    meta: "text-stone-500",
    page: "text-stone-500",
    enabled:
      "border-stone-300 bg-white text-stone-700 hover:border-stone-950 hover:text-stone-950",
    disabled: "border-stone-200 bg-stone-50 text-stone-300",
  },
  archive: {
    nav: "rounded-md border border-stone-300/80 bg-stone-50/45 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
    meta: "text-stone-600",
    page: "border-x border-dashed border-stone-300 px-3 text-stone-600",
    enabled:
      "border-stone-400/80 bg-stone-100/50 text-stone-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:border-stone-950 hover:bg-stone-50 hover:text-stone-950",
    disabled: "border-stone-300/60 bg-stone-100/25 text-stone-400",
  },
};

function buildPageHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  page: number,
) {
  const nextSearchParams = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      nextSearchParams.set(key, value);
    }
  });

  if (page <= 1) {
    nextSearchParams.delete("page");
  } else {
    nextSearchParams.set("page", String(page));
  }

  const queryString = nextSearchParams.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

function PageLink({
  children,
  disabled,
  href,
  variant,
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
  variant: keyof typeof VARIANT_STYLES;
}) {
  const styles = VARIANT_STYLES[variant];
  const className =
    "inline-flex h-10 items-center justify-center rounded-md border px-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors";

  if (disabled) {
    return <span className={`${className} ${styles.disabled}`}>{children}</span>;
  }

  return (
    <Link
      href={href}
      scroll={false}
      className={`${className} ${styles.enabled}`}
    >
      {children}
    </Link>
  );
}

export function PaginationNav({
  basePath,
  itemLabel = "записей",
  page,
  pageSize,
  searchParams,
  totalCount,
  totalPages,
  variant = "admin",
}: PaginationNavProps) {
  if (totalPages <= 1) {
    return null;
  }

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);
  const styles = VARIANT_STYLES[variant];

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-3 ${styles.nav}`}
      aria-label="Пагинация"
    >
      <div className={`font-mono text-xs uppercase tracking-[0.14em] ${styles.meta}`}>
        {startItem}-{endItem} из {totalCount} {itemLabel}
      </div>
      <div className="flex items-center gap-2">
        <PageLink
          disabled={page <= 1}
          href={buildPageHref(basePath, searchParams, page - 1)}
          variant={variant}
        >
          Назад
        </PageLink>
        <span className={`font-mono text-xs ${styles.page}`}>
          {page} / {totalPages}
        </span>
        <PageLink
          disabled={page >= totalPages}
          href={buildPageHref(basePath, searchParams, page + 1)}
          variant={variant}
        >
          Вперед
        </PageLink>
      </div>
    </nav>
  );
}
