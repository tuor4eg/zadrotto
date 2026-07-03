export function getStringListFact(
  facts: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = facts?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

export function formatFactList(values: string[], maxVisibleItems = 3) {
  if (values.length <= maxVisibleItems) {
    return values.join(", ");
  }

  return `${values.slice(0, maxVisibleItems).join(", ")} +${values.length - maxVisibleItems}`;
}

export function formatAuthorsFact(facts: Record<string, unknown> | null | undefined) {
  const authors = getStringListFact(facts, "authors");

  return authors.length > 0 ? formatFactList(authors) : null;
}
