import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deleteS3Object,
  getCoverObjectPublicUrl,
  getS3StorageConfig,
  resolveCoverUrl,
  getS3BucketAccessSettings,
  S3BucketAccessError,
  S3UploadError,
  uploadS3Object,
} from "../src/lib/services/minio";

const storageEnv = {
  S3_ENDPOINT: "http://127.0.0.1:9000/",
  S3_REGION: "us-east-1",
  S3_BUCKET: "zadrotto-covers",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
  S3_PUBLIC_BASE_URL: "http://127.0.0.1:9000/zadrotto-covers/",
};

it("S3 uploads preserve the HTTP status without exposing the response body", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [403, 507, 503]) {
      globalThis.fetch = async () => new Response("private storage diagnostics", { status });
      await assert.rejects(uploadS3Object({ objectKey: "test/logo.webp", body: Buffer.from("logo"), contentType: "image/webp", env: storageEnv }),
        (error: unknown) => error instanceof S3UploadError && error.status === status && !error.message.includes("private"));
    }
  } finally { globalThis.fetch = originalFetch; }
});

it("bucket access inspection fails closed and distinguishes permissions from transient S3 errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [403, 500, 429]) {
      globalThis.fetch = async () => new Response("Unavailable", { status });
      await assert.rejects(getS3BucketAccessSettings({ env: storageEnv }), (error: unknown) => error instanceof S3BucketAccessError && error.retryable === (status !== 403));
    }
  } finally { globalThis.fetch = originalFetch; }
});

describe("storage helpers", () => {
  it("reads normalized S3-compatible storage config from env", () => {
    assert.deepEqual(getS3StorageConfig(storageEnv), {
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      bucket: "zadrotto-covers",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      forcePathStyle: true,
      publicBaseUrl: "http://127.0.0.1:9000/zadrotto-covers",
    });
  });

  it("returns null when required storage env is missing", () => {
    assert.equal(getS3StorageConfig({}), null);
  });

  it("keeps empty and absolute cover urls unchanged", () => {
    assert.equal(resolveCoverUrl(null), null);
    assert.equal(resolveCoverUrl("  "), null);
    assert.equal(
      resolveCoverUrl("https://cdn.example.test/covers/dune.jpg"),
      "https://cdn.example.test/covers/dune.jpg",
    );
  });

  it("maps S3 object keys to the local cover route", () => {
    assert.equal(
      resolveCoverUrl("covers/authors/7/Мой файл.webp"),
      "/covers/covers/authors/7/%D0%9C%D0%BE%D0%B9%20%D1%84%D0%B0%D0%B9%D0%BB.webp",
    );
  });

  it("can still build direct public S3 urls when explicitly needed", () => {
    assert.equal(
      getCoverObjectPublicUrl("/covers/dune.jpg", storageEnv),
      "http://127.0.0.1:9000/zadrotto-covers/covers/dune.jpg",
    );
  });

  it("falls back to endpoint and bucket when public base URL is not set", () => {
    assert.equal(
      getCoverObjectPublicUrl("covers/dune.jpg", {
        ...storageEnv,
        S3_PUBLIC_BASE_URL: undefined,
      }),
      "http://127.0.0.1:9000/zadrotto-covers/covers/dune.jpg",
    );
  });

  it("deletes S3 objects with a signed DELETE request", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; method?: string }> = [];

    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), method: init?.method });

      return new Response(null, { status: 204 });
    };

    try {
      await deleteS3Object({
        objectKey: "covers/dune.jpg",
        env: storageEnv,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(requests, [
      {
        url: "http://127.0.0.1:9000/zadrotto-covers/covers/dune.jpg",
        method: "DELETE",
      },
    ]);
  });

  it("treats already missing S3 objects as deleted", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response(null, { status: 404 });

    try {
      await deleteS3Object({
        objectKey: "covers/missing.jpg",
        env: storageEnv,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
