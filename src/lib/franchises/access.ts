export function canManageFranchises(author: { accessProfileCode: string; isSystem: boolean } | null | undefined) {
  return Boolean(author && !author.isSystem && author.accessProfileCode === "trusted");
}
