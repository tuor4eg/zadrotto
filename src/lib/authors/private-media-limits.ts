export type AuthorPrivateMediaLimitInput = {
  limits: {
    maxDraftMediaItems: number | null;
    maxDraftMediaItemsPerDay: number | null;
  };
  usage: {
    totalCount: number;
    recentCount: number;
  };
};

export type AuthorPrivateMediaLimitResult =
  | { ok: true }
  | { ok: false; reason: "total-limit" | "daily-limit" };

export function checkAuthorPrivateMediaLimit(
  input: AuthorPrivateMediaLimitInput,
): AuthorPrivateMediaLimitResult {
  const { limits, usage } = input;

  if (limits.maxDraftMediaItems !== null && usage.totalCount >= limits.maxDraftMediaItems) {
    return { ok: false, reason: "total-limit" };
  }

  if (
    limits.maxDraftMediaItemsPerDay !== null &&
    usage.recentCount >= limits.maxDraftMediaItemsPerDay
  ) {
    return { ok: false, reason: "daily-limit" };
  }

  return { ok: true };
}

export function getPrivateMediaLimitWindowStart(now = new Date()) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}
