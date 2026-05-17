import Link from "next/link";
import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
} from "lucide-react";

import { PageSizeSelect } from "@/components/page-size-select";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";

type PaginationNavProps = {
  basePath: string;
  itemLabel?: string;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  searchParams: Record<string, string | undefined>;
  showPageJump?: boolean;
  totalCount: number;
  totalPages: number;
  variant?: "admin" | "archive";
};

const VARIANT_STYLES = {
  admin: {
    nav: "rounded-md border border-stone-200 bg-white px-3 py-2",
    meta: "text-stone-500",
    page: "text-stone-500",
    input: "border-stone-300 bg-white text-stone-700 focus:border-stone-950",
    button:
      "border-stone-300 bg-white text-stone-700 hover:border-stone-950 hover:text-stone-950",
    enabled:
      "border-stone-300 bg-white text-stone-700 hover:border-stone-950 hover:text-stone-950",
    disabled: "border-stone-200 bg-stone-50 text-stone-300",
  },
  archive: {
    nav: "rounded-md border border-stone-300/80 bg-stone-50/45 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
    meta: "text-stone-600",
    page: "border-x border-dashed border-stone-300 px-3 text-stone-600",
    input:
      "border-stone-300/80 bg-stone-50/70 text-stone-800 focus:border-stone-950",
    button:
      "border-stone-400/80 bg-stone-100/50 text-stone-800 hover:border-stone-950 hover:bg-stone-50 hover:text-stone-950",
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

function HiddenSearchParams({
  exclude = [],
  searchParams,
}: {
  exclude?: string[];
  searchParams: Record<string, string | undefined>;
}) {
  const excludedKeys = new Set(exclude);

  return Object.entries(searchParams).map(([key, value]) =>
    value && !excludedKeys.has(key) ? (
      <input key={key} type="hidden" name={key} value={value} />
    ) : null,
  );
}

function PageLink({
  ariaLabel,
  children,
  disabled,
  href,
  variant,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled: boolean;
  href: string;
  variant: keyof typeof VARIANT_STYLES;
}) {
  const styles = VARIANT_STYLES[variant];
  const className =
    "inline-flex size-10 items-center justify-center rounded-md border font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors";

  if (disabled) {
    const disabledLink = (
      <span aria-label={ariaLabel} aria-disabled="true" className={`${className} ${styles.disabled}`}>
        {children}
      </span>
    );

    return variant === "archive" ? (
      <ArchiveTooltip label={ariaLabel}>{disabledLink}</ArchiveTooltip>
    ) : (
      disabledLink
    );
  }

  const link = (
    <Link
      href={href}
      scroll={false}
      aria-label={ariaLabel}
      title={variant === "archive" ? undefined : ariaLabel}
      className={`${className} ${styles.enabled}`}
    >
      {children}
    </Link>
  );

  return variant === "archive" ? <ArchiveTooltip label={ariaLabel}>{link}</ArchiveTooltip> : link;
}

export function PaginationNav({
  basePath,
  itemLabel = "записей",
  page,
  pageSize,
  pageSizeOptions,
  searchParams,
  showPageJump = false,
  totalCount,
  totalPages,
  variant = "admin",
}: PaginationNavProps) {
  const shouldShowPageSizeControl =
    pageSizeOptions !== undefined &&
    pageSizeOptions.length > 0 &&
    totalCount > Math.min(...pageSizeOptions);

  if (totalPages <= 1 && !shouldShowPageSizeControl) {
    return null;
  }

  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);
  const styles = VARIANT_STYLES[variant];
  const controlClassName =
    "h-10 rounded-md border px-2 font-mono text-xs uppercase tracking-[0.08em] outline-none transition-colors";
  const pageJumpButtonClassName =
    "absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded border border-transparent transition-colors";

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-3 ${styles.nav}`}
      aria-label="Пагинация"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className={`font-mono text-xs uppercase tracking-[0.14em] ${styles.meta}`}>
          {startItem}-{endItem} из {totalCount} {itemLabel}
        </div>
        {shouldShowPageSizeControl ? (
          <form action={basePath} className="flex items-center gap-2" method="get">
            <HiddenSearchParams exclude={["page", "pageSize"]} searchParams={searchParams} />
            <label className={`font-mono text-xs uppercase tracking-[0.12em] ${styles.meta}`}>
              На странице
            </label>
            <PageSizeSelect
              ariaLabel="Записей на странице"
              className={`${controlClassName} ${styles.input}`}
              name="pageSize"
              options={pageSizeOptions}
              value={pageSize}
            />
          </form>
        ) : null}
      </div>
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <PageLink
            disabled={page <= 1}
            href={buildPageHref(basePath, searchParams, 1)}
            ariaLabel="Первая страница"
            variant={variant}
          >
            <ChevronsLeft className="size-4" />
          </PageLink>
          <PageLink
            disabled={page <= 1}
            href={buildPageHref(basePath, searchParams, page - 1)}
            ariaLabel="Предыдущая страница"
            variant={variant}
          >
            <ChevronLeft className="size-4" />
          </PageLink>
          <span className={`font-mono text-xs ${styles.page}`}>
            {page} / {totalPages}
          </span>
          <PageLink
            disabled={page >= totalPages}
            href={buildPageHref(basePath, searchParams, page + 1)}
            ariaLabel="Следующая страница"
            variant={variant}
          >
            <ChevronRight className="size-4" />
          </PageLink>
          <PageLink
            disabled={page >= totalPages}
            href={buildPageHref(basePath, searchParams, totalPages)}
            ariaLabel="Последняя страница"
            variant={variant}
          >
            <ChevronsRight className="size-4" />
          </PageLink>
          {showPageJump ? (
            <form action={basePath} className="flex items-center" method="get" noValidate>
              <HiddenSearchParams exclude={["page"]} searchParams={searchParams} />
              <label className="sr-only" htmlFor="pagination-page">
                Номер страницы
              </label>
              <div className="relative">
                <input
                  className={`w-20 pr-10 ${controlClassName} ${styles.input}`}
                  defaultValue={page}
                  id="pagination-page"
                  inputMode="numeric"
                  name="page"
                  type="text"
                />
                <button
                  aria-label="Перейти к странице"
                  className={`${pageJumpButtonClassName} ${styles.button}`}
                  type="submit"
                >
                  <CornerDownLeft className="size-4" />
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
