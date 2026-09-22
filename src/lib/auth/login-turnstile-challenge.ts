import "server-only";

import { getRedisClient } from "@/lib/services/redis";
import {
  clearAuthorLoginChallengeWithClient,
  getAuthorLoginChallengeKey,
  getAuthorLoginChallengeStateWithClient,
  recordAuthorLoginFailureWithClient,
  type AuthorLoginChallengeMutationResult,
  type AuthorLoginChallengeStateResult,
} from "./login-turnstile-challenge-store";

type ChallengeSubject = {
  ipAddress: string;
  normalizedLogin: string;
};

async function withChallengeClient<T>(
  operation: (client: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>) => Promise<T>,
): Promise<T | { ok: false; error: "unavailable" }> {
  try {
    const client = await getRedisClient();
    if (!client) return { ok: false, error: "unavailable" };

    return await operation(client);
  } catch (error) {
    console.error(error);
    return { ok: false, error: "unavailable" };
  }
}

export async function getAuthorLoginChallengeState(
  subject: ChallengeSubject,
): Promise<AuthorLoginChallengeStateResult> {
  const key = getAuthorLoginChallengeKey(subject);

  return withChallengeClient((client) => getAuthorLoginChallengeStateWithClient(client, key));
}

export async function recordAuthorLoginFailure(
  subject: ChallengeSubject,
): Promise<AuthorLoginChallengeStateResult> {
  const key = getAuthorLoginChallengeKey(subject);

  return withChallengeClient((client) => recordAuthorLoginFailureWithClient(client, key));
}

export async function clearAuthorLoginChallenge(
  subject: ChallengeSubject,
): Promise<AuthorLoginChallengeMutationResult> {
  const key = getAuthorLoginChallengeKey(subject);

  return withChallengeClient((client) => clearAuthorLoginChallengeWithClient(client, key));
}
