import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Google Analytics consent", () => {
  it("loads GA4 only after an explicit versioned consent choice", () => {
    const layer = read("src/components/archive/analytics-consent-layer.tsx");
    const consent = read("src/lib/analytics/consent.ts");

    assert.match(consent, /zadrotto:analytics-consent:v1/);
    assert.match(layer, /consent === "granted"[\s\S]*<GoogleAnalytics gaId=\{measurementId\}/);
    assert.match(layer, /Только необходимые/);
    assert.match(layer, /Разрешить аналитику/);
    assert.match(layer, /clearGoogleAnalyticsCookies\(\)/);
    assert.doesNotMatch(layer, /sendGAEvent|page_view/);
  });

  it("reads a validated measurement ID at runtime without exposing secrets", () => {
    const config = read("src/app/api/analytics-config/route.ts");
    const analytics = read("src/lib/analytics/google-analytics.ts");
    const exampleEnv = read(".env.example");
    const compose = read("docker-compose.yml");

    assert.match(analytics, /\^G-\[A-Z0-9\]\+\$/i);
    assert.match(analytics, /process\.env\.GOOGLE_ANALYTICS_ID/);
    assert.match(config, /Cache-Control": "no-store"/);
    assert.match(exampleEnv, /^GOOGLE_ANALYTICS_ID=$/m);
    assert.match(compose, /GOOGLE_ANALYTICS_ID: \$\{GOOGLE_ANALYTICS_ID:-\}/);
  });

  it("documents analytics and exposes repeatable settings", () => {
    const footer = read("src/components/archive/archive-site-footer.tsx");
    const privacy = read("src/app/privacy/page.tsx");

    assert.match(footer, /<AnalyticsSettingsButton \/>/);
    assert.match(privacy, /Google Analytics 4/);
    assert.match(privacy, /не отправляем в аналитику логины, email/);
    assert.match(privacy, /<code>_ga<\/code>/);
  });
});
