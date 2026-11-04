import { createHash, randomBytes } from "node:crypto";

import type { ExternalAuthAttempt } from "./model";

export const EXTERNAL_AUTH_TTL_SECONDS = 10 * 60;
export const EXTERNAL_AUTH_BROWSER_COOKIE = "author_external_browser";
export const newExternalAuthSecret = () => randomBytes(32).toString("base64url");
export const hashExternalAuthSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const externalAttemptKey = (state: string) => `auth:external:attempt:${hashExternalAuthSecret(state)}`;

export type AttemptStore = {
  set(key: string, value: string, options: { EX: number; NX: true }): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export async function saveExternalAttempt(client: AttemptStore, attempt: ExternalAuthAttempt) {
  const result = await client.set(externalAttemptKey(attempt.state), JSON.stringify(attempt), {
    EX: EXTERNAL_AUTH_TTL_SECONDS, NX: true,
  });
  if (result !== "OK") throw new Error("External auth attempt unavailable");
}

// Check binding before deletion: a request from another browser cannot consume the attempt.
const CONSUME_ATTEMPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local attempt = cjson.decode(raw)
if attempt.browserHash ~= ARGV[1] or attempt.provider ~= ARGV[2] then return nil end
redis.call('DEL', KEYS[1])
return raw
`;

export async function consumeExternalAttempt(client: AttemptStore, input: {
  state: string; browser: string; provider: string;
}): Promise<ExternalAuthAttempt | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state) || !/^[A-Za-z0-9_-]{43}$/.test(input.browser)) return null;
  const raw = await client.eval(CONSUME_ATTEMPT, {
    keys: [externalAttemptKey(input.state)],
    arguments: [hashExternalAuthSecret(input.browser), input.provider],
  });
  if (typeof raw !== "string") return null;
  const attempt = JSON.parse(raw) as ExternalAuthAttempt;
  if (attempt.state !== input.state || attempt.provider !== input.provider
    || attempt.browserHash !== hashExternalAuthSecret(input.browser)
    || !["login", "link"].includes(attempt.intent)
    || typeof attempt.verifier !== "string" || typeof attempt.nonce !== "string"
    || typeof attempt.returnTo !== "string") return null;
  return attempt;
}
