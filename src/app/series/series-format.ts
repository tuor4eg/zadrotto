export function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

export function formatSeriesCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "серия" : plural === "few" ? "серии" : "серий";

  return `${count} ${label}`;
}
