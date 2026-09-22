import { createHash } from "node:crypto";

export const AUTHOR_LOGIN_TURNSTILE_THRESHOLD = 3;
export const AUTHOR_LOGIN_TURNSTILE_TTL_SECONDS = 15 * 60;

type ChallengeStoreClient = {
  del(key: string): Promise<number>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
  get(key: string): Promise<string | null>;
};

export type AuthorLoginChallengeStateResult =
  | { ok: true; challengeRequired: boolean; failures: number }
  | { ok: false; error: "unavailable" };

export type AuthorLoginChallengeMutationResult =
  | { ok: true }
  | { ok: false; error: "unavailable" };

const RECORD_FAILURE_SCRIPT = `
local failures = redis.call("INCR", KEYS[1])
local ttl = redis.call("TTL", KEYS[1])

if failures == 1 or ttl < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

return failures
`;

export function getAuthorLoginChallengeKey(input: {
  ipAddress: string;
  normalizedLogin: string;
}) {
  const subject = createHash("sha256")
    .update(JSON.stringify([input.ipAddress, input.normalizedLogin]))
    .digest("hex");

  return `auth:author-password:turnstile:${subject}`;
}

function parseFailures(value: unknown) {
  const failures = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(failures) && failures >= 0 ? failures : null;
}

function buildState(failures: number): AuthorLoginChallengeStateResult {
  return {
    ok: true,
    challengeRequired: failures >= AUTHOR_LOGIN_TURNSTILE_THRESHOLD,
    failures,
  };
}

export async function getAuthorLoginChallengeStateWithClient(
  client: Pick<ChallengeStoreClient, "get">,
  key: string,
): Promise<AuthorLoginChallengeStateResult> {
  const rawFailures = await client.get(key);
  const failures = rawFailures === null ? 0 : parseFailures(rawFailures);

  return failures === null ? { ok: false, error: "unavailable" } : buildState(failures);
}

export async function recordAuthorLoginFailureWithClient(
  client: Pick<ChallengeStoreClient, "eval">,
  key: string,
): Promise<AuthorLoginChallengeStateResult> {
  const rawFailures = await client.eval(RECORD_FAILURE_SCRIPT, {
    keys: [key],
    arguments: [String(AUTHOR_LOGIN_TURNSTILE_TTL_SECONDS)],
  });
  const failures = parseFailures(rawFailures);

  return failures === null ? { ok: false, error: "unavailable" } : buildState(failures);
}

export async function clearAuthorLoginChallengeWithClient(
  client: Pick<ChallengeStoreClient, "del">,
  key: string,
): Promise<AuthorLoginChallengeMutationResult> {
  const deleted = await client.del(key);

  return Number.isSafeInteger(deleted) && deleted >= 0
    ? { ok: true }
    : { ok: false, error: "unavailable" };
}
