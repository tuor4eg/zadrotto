import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("provider smoke-test admin UI", () => {
  it("adds a test control and a loading result modal without activity logging", () => {
    const form = readProjectFile("src/app/admin/(protected)/tools/providers/providers-form.tsx");
    const actions = readProjectFile("src/app/admin/(protected)/settings/actions.ts");

    assert.match(form, /aria-label=\{`Проверить доступность \$\{COVER_PROVIDER_LABELS\[provider\.providerCode\]\}`\}/);
    assert.match(form, /<ProviderSmokeTestModal[\s\S]*provider=\{smokeTestProvider\}/);
    assert.match(form, /<LoaderCircle className="size-5 animate-spin" \/>/);
    assert.match(form, /testCoverProviderAction\(provider\.providerCode, provider\.mediaType\)/);
    assert.match(form, /HTTP \{result\.httpStatus\}/);
    assert.match(form, /\{result\.providerMessage\}/);
    assert.match(actions, /export async function testCoverProviderAction[\s\S]*await requireAdminUser\(\)/);
    assert.doesNotMatch(actions, /cover-provider\.tested/);
  });

  it("formats provider rows as cards on mobile and restores the grid on larger screens", () => {
    const form = readProjectFile("src/app/admin/(protected)/tools/providers/providers-form.tsx");

    assert.match(form, /rounded-lg border border-stone-200 bg-white p-4 shadow-sm[\s\S]*sm:grid/);
    assert.match(form, /border-t border-stone-100 pt-3 sm:contents/);
    assert.match(form, /order-first h-9 w-full text-xs sm:order-none sm:w-\[9\.5rem\]/);
  });
});
