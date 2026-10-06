import assert from "node:assert/strict";
import { test } from "node:test";

test("genre request worker accepts only a serial request ID and cannot be scheduled", { skip: !process.env.GENRES_TEST_DATABASE_URL }, async () => {
  const { jobHandlerRegistry } = await import("../src/lib/jobs/handlers");
  const handler = jobHandlerRegistry.get("media.genre-request-apply");
  assert.equal(handler.schedulable, false);
  assert.deepEqual(handler.parsePayload({ requestId: 53 }), { requestId: 53 });
  for (const payload of [null, [], {}, { requestId: "1" }, { requestId: 0 }, { requestId: 1.5 }, { requestId: 2147483648 }, { requestId: 1, provider: "tmdb" }]) {
    assert.throws(() => handler.parsePayload(payload), { code: "invalid-payload", retryable: false });
  }
});
