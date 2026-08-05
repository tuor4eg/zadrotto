import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("provider image relay data contracts", () => {
  it("stores one global disabled-by-default setting per provider", () => {
    const schema = readProjectFile("src/db/schema.ts");
    const migration = readProjectFile("drizzle/0052_provider_image_settings.sql");
    const queries = readProjectFile("src/db/queries/cover-settings.ts");

    assert.match(schema, /providerImageSettings[\s\S]*providerCode: text\("provider_code"\)\.primaryKey\(\)/);
    assert.match(schema, /proxyImagesEnabled: boolean\("proxy_images_enabled"\)\.default\(false\)\.notNull\(\)/);
    assert.match(migration, /"provider_code" text PRIMARY KEY NOT NULL/);
    assert.match(migration, /"proxy_images_enabled" boolean DEFAULT false NOT NULL/);
    assert.match(queries, /proxyImagesEnabled: rowsByCode\.get\(providerCode\)\?\.proxyImagesEnabled \?\? false/);
    assert.match(queries, /return row\?\.proxyImagesEnabled \?\? false/);
  });

  it("proxies API display URLs without replacing the original cover candidate token payload", () => {
    const coverRoute = readProjectFile("src/app/api/cover-candidates/route.ts");
    const titleRoute = readProjectFile("src/app/api/media-title-candidates/route.ts");

    assert.match(coverRoute, /imageUrl: proxyEnabled[\s\S]*getProviderImageRelayUrl\(candidate\.provider, candidate\.imageUrl\)/);
    assert.match(coverRoute, /token: createCoverCandidateToken\(candidate\)/);
    assert.doesNotMatch(coverRoute, /createCoverCandidateToken\([^)]*getProviderImageRelayUrl/);
    assert.match(titleRoute, /coverUrl:[\s\S]*getProviderImageRelayUrl\(candidate\.provider, candidate\.coverUrl\)/);
  });

  it("keeps the provider toggle global and uses image fallbacks in both pickers", () => {
    const providerForm = readProjectFile("src/app/admin/(protected)/tools/providers/providers-form.tsx");
    const titlePicker = readProjectFile("src/components/ui/media-title-candidate-picker.tsx");
    const coverPreview = readProjectFile("src/app/author/(protected)/media/cover-preview.tsx");

    assert.match(providerForm, /new Set\(imageSettings\.filter\([\s\S]*\.map\(\(setting\) => setting\.providerCode\)\)/);
    assert.match(providerForm, /saveImageSetting\(provider\.providerCode, !proxyImagesEnabled\)/);
    assert.match(titlePicker, /ImageWithFallback/);
    assert.match(coverPreview, /ImageWithFallback/);
  });

  it("authorizes and rate-limits relay requests by the authenticated actor", () => {
    const route = readProjectFile("src/app/api/provider-image/route.ts");

    assert.match(route, /if \(!adminUser && !author\) return new NextResponse\(null, \{ status: 401 \}\)/);
    assert.match(route, /adminUser \? `admin:\$\{adminUser\.id\}` : `author:\$\{author!\.id\}`/);
    assert.match(route, /if \(!rateLimit\.allowed\)[\s\S]*status: 429/);
    assert.match(route, /"retry-after": String\(rateLimit\.retryAfterSeconds\)/);
  });

  it("maps relay validation and fetch outcomes to explicit HTTP responses", () => {
    const route = readProjectFile("src/app/api/provider-image/route.ts");

    assert.match(route, /if \(!payload\) return new NextResponse\(null, \{ status: 400 \}\)/);
    assert.match(route, /if \(!enabled\) return new NextResponse\(null, \{ status: 404 \}\)/);
    assert.match(route, /image\.error === "too-large" \? 413/);
    assert.match(route, /image\.error === "unsupported-type" \? 415 : 502/);
    assert.match(route, /"cache-control": "private, max-age=300"/);
    assert.match(route, /"x-content-type-options": "nosniff"/);
  });

  it("requires an administrator and logs every provider relay setting change", () => {
    const actions = readProjectFile("src/app/admin/(protected)/settings/actions.ts");

    assert.match(actions, /updateCoverProviderImageSettingAction[\s\S]*await requireAdminUser\(\)/);
    assert.match(actions, /updateCoverProviderImageSetting\(\{ providerCode, proxyImagesEnabled, updatedByAdminId: adminUser\.id \}\)/);
    assert.match(actions, /action: "cover-provider-image-relay\.updated"/);
    assert.match(actions, /actorType: "admin"[\s\S]*adminUserId: adminUser\.id/);
    assert.match(actions, /metadata: \{ providerCode, proxyImagesEnabled \}/);
  });
});
