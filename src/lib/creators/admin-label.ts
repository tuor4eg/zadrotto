export function creatorAdminLabel(id: number, name: string | null | undefined) {
  return `${name || "Удалённый создатель"} (№${id})`;
}
