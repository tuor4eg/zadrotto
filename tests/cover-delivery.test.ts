import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const coverRoute = readFileSync(
  "src/app/covers/[...objectKey]/route.ts",
  "utf8",
);
const nginxConfig = readFileSync("deploy/nginx/zadrotto.conf", "utf8");

describe("protected cover delivery", () => {
  it("authorizes the object before delegating delivery to nginx", () => {
    assert.match(coverRoute, /getSafeCoverObjectKey\(segments\)/);
    assert.match(coverRoute, /if \(!objectKey\)[\s\S]*status: 404/);
    assert.match(
      coverRoute,
      /canViewMediaItemCover\([\s\S]*if \(!canViewCover\)[\s\S]*status: 404[\s\S]*"X-Accel-Redirect"/,
    );
    assert.match(coverRoute, /Promise\.all\(\[getCurrentAuthor\(\), getCurrentAdminUser\(\)\]\)/);
    assert.match(coverRoute, /isAdmin: Boolean\(adminUser\)/);
  });

  it("streams authorized covers directly from S3 during local development", () => {
    assert.match(
      coverRoute,
      /process\.env\.NODE_ENV === "development"[\s\S]*fetchS3Object\(\{ objectKey \}\)[\s\S]*new Response\(s3Response\.body/,
    );
    assert.match(coverRoute, /"Cache-Control": "private, max-age=300"/);
    assert.match(coverRoute, /"X-Content-Type-Options": "nosniff"/);
  });

  it("encodes every object key segment and keeps browser caching private", () => {
    assert.match(coverRoute, /segments\.map\(encodeURIComponent\)\.join\("\/"\)/);
    assert.match(
      coverRoute,
      /"Cache-Control": "private, max-age=31536000, immutable"/,
    );
    assert.match(
      coverRoute,
      /"X-Accel-Redirect": getInternalCoverPath\(segments\)/,
    );
  });

  it("uses an internal shared nginx cache backed by Beget S3", () => {
    assert.match(
      nginxConfig,
      /proxy_cache_path \/var\/cache\/nginx\/zadrotto-covers[\s\S]*max_size=5g[\s\S]*inactive=30d/,
    );
    assert.match(nginxConfig, /location \^~ \/_protected-covers\/ \{\s*internal;/);
    assert.match(
      nginxConfig,
      /proxy_pass https:\/\/s3\.ru1\.storage\.beget\.cloud\/f2b3393cb6fc-zadrotto\//,
    );
    assert.match(nginxConfig, /proxy_cache_key \$uri;/);
    assert.doesNotMatch(nginxConfig, /proxy_cache_key[^;]*\$(?:cookie|http_authorization)/i);
    assert.match(nginxConfig, /proxy_cache_lock on;/);
  });

  it("caches only successful responses and exposes final cache diagnostics", () => {
    assert.match(nginxConfig, /proxy_cache_valid 200 30d;/);
    assert.match(nginxConfig, /proxy_cache_valid any 0;/);
    assert.match(
      nginxConfig,
      /add_header Cache-Control "private, max-age=31536000, immutable" always;/,
    );
    assert.match(
      nginxConfig,
      /add_header X-Cache-Status \$upstream_cache_status always;/,
    );
  });
});
