import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deleteS3Object,
  getCoverObjectPublicUrl,
  getS3StorageConfig,
  resolveCoverUrl,
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
