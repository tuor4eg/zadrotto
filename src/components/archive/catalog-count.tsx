import { getCatalogCountTier } from "@/lib/common/catalog-alphabet";

const COUNT_BADGE_STYLES = {
  small: "size-6 text-[0.6rem]",
  medium: "size-7 text-xs font-semibold",
  large: "size-9 text-base font-bold",
} as const;

export const CATALOG_TITLE_STYLES = {
  small: "text-base font-medium",
  medium: "text-xl font-semibold",
  large: "text-2xl font-semibold",
} as const;

function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

export function CatalogCountBadge({ count }: { count: number }) {
  const tier = getCatalogCountTier(count);

  return (
    <span
      aria-label={formatMediaItemsCount(count)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-stone-400/55 bg-transparent font-mono leading-none text-stone-600 ${COUNT_BADGE_STYLES[tier]}`}
      title={formatMediaItemsCount(count)}
    >
      {count}
    </span>
  );
}

