import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCoverObjectPublicUrl, getS3StorageConfig, resolveCoverUrl } from "../src/lib/storage";

const storageEnv = {
  S3_ENDPOINT: "http://127.0.0.1:9000/",
  S3_REGION: "us-east-1",
  S3_BUCKET: "zadrotto-covers",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
  S3_PUBLIC_BASE_URL: "http://127.0.0.1:9000/zadrotto-covers/",
};

describe("getS3StorageConfig", () => {
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
});

describe("getCoverObjectPublicUrl", () => {
  it("builds a public cover URL from an object key", () => {
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
});

describe("resolveCoverUrl", () => {
  it("keeps absolute cover URLs unchanged", () => {
    assert.equal(
      resolveCoverUrl("https://cdn.example.test/covers/dune.jpg", storageEnv),
      "https://cdn.example.test/covers/dune.jpg",
    );
  });

  it("returns null for an empty cover URL or missing storage config", () => {
    assert.equal(resolveCoverUrl(null, storageEnv), null);
    assert.equal(resolveCoverUrl(" ", storageEnv), null);
    assert.equal(resolveCoverUrl("covers/dune.jpg", {}), null);
  });
});
