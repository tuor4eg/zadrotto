import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const loadingSource = readFileSync("src/components/ui/route-transition-progress.tsx", "utf8");
const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");

describe("root route loading feedback", () => {
  it("keeps route progress mounted outside changing page content", () => {
    assert.match(layoutSource, /<RouteTransitionProgress \/>/);
    assert.match(layoutSource, /<Suspense fallback=\{null\}>/);
    assert.match(loadingSource, /role="status"/);
    assert.match(loadingSource, /aria-live="polite"/);
    assert.match(loadingSource, /aria-label="Загружаем страницу"/);
    assert.match(loadingSource, /route-loading-progress/);
    assert.doesNotMatch(loadingSource, /Loader2|backdrop-blur|archive-paper-surface/);
    assert.match(
      loadingSource,
      /document\.addEventListener\("click", handleClick, \{ capture: true \}\)/,
    );
    assert.match(loadingSource, /window\.addEventListener\("popstate", handlePopState\)/);
    assert.match(loadingSource, /flushSync\(\(\) => setIsVisible\(true\)\)/);
    assert.match(loadingSource, /const routeKey = `\$\{pathname\}\?\$\{searchParams\.toString\(\)\}`/);
    assert.match(loadingSource, /\}, \[routeKey\]\)/);
  });

  it("avoids flashing on fast transitions and respects reduced motion", () => {
    assert.match(globalsSource, /route-loading-reveal[\s\S]*120ms forwards/);
    assert.match(globalsSource, /route-loading-progress 1\.1s ease-in-out infinite/);
    assert.match(globalsSource, /prefers-reduced-motion: reduce/);
  });
});
