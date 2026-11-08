import assert from "node:assert/strict";
import { it } from "node:test";
import type { RedisClientType } from "redis";

import { checkForgotPasswordCooldownWithClient } from "@/lib/auth/forgot-password-rate-limit";

type Client = Pick<RedisClientType, "eval">;
const input = { ipAddress: "192.0.2.1", normalizedEmail: "person@example.com" };

it("maps cooldown results and fails closed on Redis errors or invalid responses", async () => {
  for (const [reply, expected] of [
    [0, { ok: true }],
    [30, { ok: false, reason: "limited", retryAfterSeconds: 30 }],
    [900, { ok: false, reason: "limited", retryAfterSeconds: 900 }],
    [null, { ok: false, reason: "unavailable" }],
    [-1, { ok: false, reason: "unavailable" }],
  ] as const) {
    const client = { eval: async () => reply } as unknown as Client;
    assert.deepEqual(await checkForgotPasswordCooldownWithClient(input, client), expected);
  }
  const client = { eval: async () => { throw new Error("Redis down"); } } as unknown as Client;
  assert.deepEqual(await checkForgotPasswordCooldownWithClient(input, client), { ok: false, reason: "unavailable" });
});

it("shares the IP bucket across emails and the email bucket across IPs without storing raw identifiers", async () => {
  const calls: string[][] = [];
  const client = { eval: async (_script: string, options: { keys: string[] }) => {
    calls.push(options.keys);
    return 0;
  } } as unknown as Client;
  await checkForgotPasswordCooldownWithClient(input, client);
  await checkForgotPasswordCooldownWithClient({ ...input, normalizedEmail: "other@example.com" }, client);
  await checkForgotPasswordCooldownWithClient({ ...input, ipAddress: "192.0.2.2" }, client);
  assert.equal(calls[0][0], calls[1][0]);
  assert.notEqual(calls[0][1], calls[1][1]);
  assert.equal(calls[0][1], calls[2][1]);
  assert.notEqual(calls[0][0], calls[2][0]);
  assert.ok(calls.flat().every((key) => !key.includes(input.ipAddress) && !key.includes(input.normalizedEmail)));
});
