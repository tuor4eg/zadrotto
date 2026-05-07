export function normalizeOptionalFranchiseString(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function parseRequiredFranchiseId(value: string) {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return { ok: false as const };
  }

  const parsedValue = Number(normalized);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? { ok: true as const, value: parsedValue }
    : { ok: false as const };
}
