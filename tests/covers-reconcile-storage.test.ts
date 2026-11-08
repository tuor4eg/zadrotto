import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import sharp from "sharp";
import { probeS3Object } from "@/lib/services/minio";
import { uploadExternalCoverCandidate, createCoverThumbFromObjectKey } from "@/lib/covers/storage";

const originalFetch = globalThis.fetch;
const env = { S3_ENDPOINT: "https://storage.invalid", S3_BUCKET: "covers", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_FORCE_PATH_STYLE: "true" };
afterEach(() => { globalThis.fetch = originalFetch; });

test("probe signs HEAD without bucket permissions and confirms ambiguous object 404 via GET", async () => {
  const methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://storage.invalid/covers/covers/a.png");
    assert.match(String((init?.headers as Record<string, string>).Authorization), /AWS4-HMAC-SHA256/);
    assert.equal(init?.redirect, "manual");
    methods.push(init!.method!);
    return new Response(init?.method === "HEAD" ? null : "<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
  };
  assert.deepEqual(await probeS3Object({ objectKey: "covers/a.png", env }), { status: "missing" });
  assert.deepEqual(methods, ["HEAD", "GET"]);
});

test("probe preserves bucket/access/config errors and retries temporary errors", async () => {
  for (const [status, code, fatal] of [[404, "NoSuchBucket", true], [403, "AccessDenied", true], [503, "SlowDown", false], [429, "SlowDown", false]] as const) {
    globalThis.fetch = async () => new Response(null, { status, headers: { "x-amz-error-code": code } });
    assert.deepEqual(await probeS3Object({ objectKey: "a", env }), { status: "error", code, fatal, retryable: !fatal });
  }
  assert.deepEqual(await probeS3Object({ objectKey: "a", env: {} }), { status: "error", code: "StorageNotConfigured", fatal: true, retryable: false });
  globalThis.fetch = async () => new Response("<Error><Code>NoSuchBucket</Code></Error>", { status: 404 });
  assert.equal((await probeS3Object({ objectKey: "a", env })).status, "error");
});

test("ambiguous bare 404 never becomes missing; successful fallback cancels body", async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });
  assert.equal((await probeS3Object({ objectKey: "a", env })).status, "error");
  let cancelled = false;
  globalThis.fetch = async (_url, init) => init?.method === "HEAD" ? new Response(null, { status: 404 }) : new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  assert.deepEqual(await probeS3Object({ objectKey: "a", env }), { status: "exists" });
  assert.equal(cancelled, true);
});

const candidate = { id: "123", provider: "tmdb" as const, title: "Example", imageUrl: "https://image.tmdb.org/a.jpg", sourcePageUrl: "https://themoviedb.org/movie/123" };
test("candidate upload distinguishes permanent image absence, temporary failure, and invalid image before PUT", async () => {
  for (const status of [404, 410, 503]) {
    globalThis.fetch = async () => new Response(null, { status });
    const result = await uploadExternalCoverCandidate({ mediaItemCode: "example", candidate });
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.httpStatusCode, status); assert.equal(result.retryable, status === 503); }
  }
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("not an image", { headers: { "content-type": "image/jpeg" } }); };
  assert.deepEqual(await uploadExternalCoverCandidate({ mediaItemCode: "example", candidate }), { ok: false, error: "cover-type", retryable: false });
  assert.equal(requests, 1);
});

test("upload records candidate source and keeps original after fatal thumbnail upload", async () => {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
  let puts = 0;
  globalThis.fetch = async (_url, init) => init?.method === "PUT" ? new Response(null, { status: ++puts === 1 ? 200 : 403 }) : new Response(new Uint8Array(image), { headers: { "content-type": "image/png" } });
  try {
    const result = await uploadExternalCoverCandidate({ mediaItemCode: "example", candidate });
    assert.equal(result.ok, true);
    if (result.ok) { assert.deepEqual(result.source, { provider: "tmdb", externalId: "123", pageUrl: candidate.sourcePageUrl }); assert.equal(result.fatalStorage, true); assert.equal(result.thumbnailRetryable, false); assert.equal(result.coverThumbUrl, null); }
    let target = "";
    globalThis.fetch = async (url, init) => { if (init?.method === "PUT") target = String(url); return new Response(init?.method === "PUT" ? null : new Uint8Array(image)); };
    assert.deepEqual(await createCoverThumbFromObjectKey("covers/a.png", { objectKey: "covers/unique.webp" }), { ok: true, coverThumbUrl: "covers/unique.webp" });
    assert.equal(target, "https://storage.invalid/covers/covers/unique.webp");
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
